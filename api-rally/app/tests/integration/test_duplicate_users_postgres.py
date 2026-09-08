"""Real-schema tests for the one-row-per-person guarantee.

Two rows for one person is what this whole area is about: staff are mirrored
from Authentik by email with no ``authentik_sub``, and first login is supposed
to adopt that row. When it does not, the person gets a second account — and
since ``rally_staff_assignment.user_id`` is not a foreign key, their checkpoint
stays behind on the first row while the account they actually use shows up
unassigned.

Covers both halves: the login path no longer creates the duplicate, and the
0059 merge collapses the ones already in the database.
"""

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.api import deps
from app.core.config import settings as app_settings
from app.crud.crud_user import user as crud_user
from app.db import duplicate_users as dup
from app.models.checkpoint import CheckPoint
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.models.user import User
from app.schemas.user import UserCreate
from app.tests.conftest import _PG_SCHEMA, make_event, make_team

pytestmark = pytest.mark.asyncio


class _Auth:
    """Stand-in for AuthData; the real one is built from validated claims."""

    def __init__(self, *, sub, email, name="João Roldão", scopes=(), email_verified=False):
        self.oidc_sub = sub
        self.email = email
        self.name = name
        self.scopes = list(scopes)
        self.email_verified = email_verified


class _Settings:
    def __init__(self, *, trust_unverified: bool):
        self.OIDC_TRUST_UNVERIFIED_EMAIL = trust_unverified


async def _mirror_staff(pg_session, *, email, name="João Roldão"):
    """What the Authentik group sync leaves behind before the first login."""
    return await crud_user.get_or_create_mirror(
        pg_session, name=name, email=email, scope="rally-staff"
    )


async def _make_checkpoint(pg_session, name, order):
    event = await make_event(pg_session, event_type="rally_tascas")
    checkpoint = CheckPoint(name=name, order=order, event_id=event.id)
    pg_session.add(checkpoint)
    await pg_session.commit()
    await pg_session.refresh(checkpoint)
    return checkpoint


async def _drop_email_index(pg_session):
    """Reproduce a pre-0059 database: the unique index never existed there
    (0049 built it for a table name that does not exist), which is exactly why
    duplicates could land."""
    await pg_session.execute(text(dup.drop_unique_email_index_sql(_PG_SCHEMA)))
    await pg_session.commit()


async def _fresh_users(pg_session, email):
    """Re-read from the database: the merge runs as raw SQL, so ORM objects
    loaded before it are stale."""
    return await pg_session.scalars(
        select(User).where(User.email == email).execution_options(populate_existing=True)
    )


async def _count_users(pg_session, email):
    return await pg_session.scalar(
        select(func.count()).select_from(User).where(func.lower(User.email) == email.lower())
    )


# ---------- the login path no longer duplicates ----------


async def test_first_login_adopts_mirror_without_email_verified_claim(pg_session):
    """The reported bug: Authentik does not emit ``email_verified``, so the
    person logging in got a brand-new row and lost their checkpoint."""
    mirror = await _mirror_staff(pg_session, email="jroldao04@ua.pt")
    checkpoint = await _make_checkpoint(pg_session, "Refúgio dos drinks", 1)
    pg_session.add(RallyStaffAssignment(user_id=mirror.id, checkpoint_id=checkpoint.id))
    await pg_session.commit()

    adopted = await deps._adopt_email_placeholder(
        pg_session,
        _Auth(sub="jwt-sub-1", email="jroldao04@ua.pt", scopes=["rally-staff"]),
        _Settings(trust_unverified=True),
    )

    assert adopted is not None
    assert adopted.id == mirror.id
    assert adopted.authentik_sub == "jwt-sub-1"
    assert await _count_users(pg_session, "jroldao04@ua.pt") == 1
    still_assigned = await pg_session.scalar(
        select(RallyStaffAssignment.checkpoint_id).where(RallyStaffAssignment.user_id == mirror.id)
    )
    assert still_assigned == checkpoint.id


async def test_first_login_adopts_mirror_despite_email_case_mismatch(pg_session):
    """Authentik's API and the JWT claim need not agree on case."""
    mirror = await _mirror_staff(pg_session, email="Joao.Case@UA.PT")

    adopted = await deps._adopt_email_placeholder(
        pg_session,
        _Auth(sub="jwt-sub-2", email="joao.case@ua.pt"),
        _Settings(trust_unverified=True),
    )

    assert adopted is not None
    assert adopted.id == mirror.id
    assert await _count_users(pg_session, "joao.case@ua.pt") == 1


async def test_adoption_refused_for_unverified_email_when_trust_is_off(pg_session):
    """The strict setting keeps the original defence: an unverified claim must
    not inherit a pre-provisioned account's scopes."""
    mirror = await _mirror_staff(pg_session, email="strict@ua.pt")

    adopted = await deps._adopt_email_placeholder(
        pg_session,
        _Auth(sub="jwt-sub-3", email="strict@ua.pt", email_verified=False),
        _Settings(trust_unverified=False),
    )

    assert adopted is None
    await pg_session.refresh(mirror)
    assert mirror.authentik_sub is None


async def test_adoption_never_steals_an_already_claimed_account(pg_session):
    """A row someone has already logged in as is off limits, however the
    matching email arrived."""
    claimed = await crud_user.create_for_oidc(
        pg_session,
        authentik_sub="original-sub",
        name="Owner",
        email="owner@ua.pt",
        scopes=[],
    )

    adopted = await deps._adopt_email_placeholder(
        pg_session,
        _Auth(sub="attacker-sub", email="owner@ua.pt", email_verified=True),
        _Settings(trust_unverified=True),
    )

    assert adopted is None
    await pg_session.refresh(claimed)
    assert claimed.authentik_sub == "original-sub"


async def test_mirror_skips_members_without_an_email(pg_session):
    """A row with no email can never be matched again, so it was re-inserted on
    every listing request and could never be adopted at login either."""
    before = await pg_session.scalar(select(func.count()).select_from(User))

    for _ in range(3):
        assert await _mirror_staff(pg_session, email=None, name="Sem Email") is None

    assert await pg_session.scalar(select(func.count()).select_from(User)) == before


async def test_mirror_is_idempotent_across_repeated_syncs(pg_session):
    first = await _mirror_staff(pg_session, email="repeat@ua.pt")
    second = await _mirror_staff(pg_session, email="REPEAT@ua.pt")

    assert second is not None
    assert second.id == first.id
    assert await _count_users(pg_session, "repeat@ua.pt") == 1


async def test_duplicate_email_insert_is_rejected_by_the_database(pg_session):
    """The index 0049 meant to create: without it nothing stopped the second
    row from landing."""
    await crud_user.create_for_oidc(
        pg_session, authentik_sub="sub-a", name="A", email="clash@ua.pt", scopes=[]
    )
    with pytest.raises(IntegrityError):
        await crud_user.create_for_oidc(
            pg_session, authentik_sub="sub-b", name="B", email="clash@ua.pt", scopes=[]
        )
    await pg_session.rollback()


async def test_placeholder_members_without_email_are_still_allowed(pg_session):
    """The unique index is partial: admins create name-only team members."""
    await crud_user.create(pg_session, obj_in=UserCreate(name="Placeholder One"), commit=True)
    await crud_user.create(pg_session, obj_in=UserCreate(name="Placeholder Two"), commit=True)


# ---------- the 0059 merge ----------


async def _run_merge(pg_session):
    """Execute the 0059 statements against the test schema."""
    schema = _PG_SCHEMA
    await pg_session.execute(text(dup.normalize_emails_sql(schema)))
    await pg_session.execute(text(dup.build_dup_map_sql(schema)))
    await pg_session.execute(text(dup.merge_fields_sql(schema)))
    await pg_session.execute(text(dup.release_loser_subs_sql(schema)))
    for table, other_column in dup.ASSIGNMENT_TABLES:
        await pg_session.execute(text(dup.repoint_assignment_sql(schema, table, other_column)))
        await pg_session.execute(text(dup.drop_leftover_assignment_sql(schema, table)))
    await pg_session.execute(text(dup.repoint_push_subscriptions_sql(schema)))
    await pg_session.execute(text(dup.delete_losers_sql(schema)))
    await pg_session.execute(text(dup.create_unique_email_index_sql(schema)))
    await pg_session.commit()


async def test_merge_collapses_duplicates_and_keeps_both_assignments(pg_session):
    """The shape actually in production: an older mirrored row holding the
    checkpoint, and a newer logged-in row holding the identity."""
    await _drop_email_index(pg_session)
    checkpoint = await _make_checkpoint(pg_session, "Refúgio dos drinks", 1)
    team = await make_team(pg_session, name="Equipa Merge", event_id=checkpoint.event_id)

    placeholder = User(
        authentik_sub=None,
        name="João Roldão",
        email="JRoldao04@ua.pt",
        scopes=["rally-staff"],
    )
    logged_in = User(
        authentik_sub="real-sub",
        name="João Roldão",
        email="jroldao04@ua.pt",
        scopes=["rally-guide"],
        is_captain=True,
    )
    pg_session.add_all([placeholder, logged_in])
    await pg_session.commit()
    await pg_session.refresh(placeholder)
    await pg_session.refresh(logged_in)

    pg_session.add_all(
        [
            RallyStaffAssignment(user_id=placeholder.id, checkpoint_id=checkpoint.id),
            RallyGuideAssignment(user_id=logged_in.id, team_id=team.id),
        ]
    )
    await pg_session.commit()

    await _run_merge(pg_session)

    survivors = (await _fresh_users(pg_session, "jroldao04@ua.pt")).all()
    assert len(survivors) == 1
    survivor = survivors[0]
    # The logged-in row wins: it is the one the person's token resolves to.
    assert survivor.id == logged_in.id
    assert survivor.authentik_sub == "real-sub"
    assert set(survivor.scopes) == {"rally-staff", "rally-guide"}
    assert survivor.is_captain is True

    staff_owner = await pg_session.scalar(
        select(RallyStaffAssignment.user_id).where(
            RallyStaffAssignment.checkpoint_id == checkpoint.id
        )
    )
    guide_owner = await pg_session.scalar(
        select(RallyGuideAssignment.user_id).where(RallyGuideAssignment.team_id == team.id)
    )
    assert staff_owner == survivor.id
    assert guide_owner == survivor.id


async def test_merge_keeps_the_placeholder_sub_when_only_it_has_one(pg_session):
    """Survivor preference is "has an authentik_sub", not "oldest id"."""
    await _drop_email_index(pg_session)
    logged_in = User(authentik_sub="kept-sub", name="Ana", email="ana@ua.pt", scopes=[])
    pg_session.add(logged_in)
    await pg_session.commit()
    later_mirror = User(authentik_sub=None, name="Ana", email="ana@ua.pt", scopes=["rally-staff"])
    pg_session.add(later_mirror)
    await pg_session.commit()

    await _run_merge(pg_session)

    survivors = (await _fresh_users(pg_session, "ana@ua.pt")).all()
    assert len(survivors) == 1
    assert survivors[0].authentik_sub == "kept-sub"
    assert survivors[0].scopes == ["rally-staff"]


async def test_merge_drops_a_colliding_duplicate_assignment(pg_session):
    """Both rows assigned to the same checkpoint: the pair is unique, so the
    loser's row is dropped rather than repointed onto a conflict."""
    await _drop_email_index(pg_session)
    checkpoint = await _make_checkpoint(pg_session, "CP Collide", 2)

    a = User(authentik_sub=None, name="Bea", email="bea@ua.pt", scopes=["rally-staff"])
    b = User(authentik_sub="bea-sub", name="Bea", email="bea@ua.pt", scopes=["rally-staff"])
    pg_session.add_all([a, b])
    await pg_session.commit()
    await pg_session.refresh(a)
    await pg_session.refresh(b)
    pg_session.add_all(
        [
            RallyStaffAssignment(user_id=a.id, checkpoint_id=checkpoint.id),
            RallyStaffAssignment(user_id=b.id, checkpoint_id=checkpoint.id),
        ]
    )
    await pg_session.commit()

    await _run_merge(pg_session)

    rows = (
        await pg_session.scalars(
            select(RallyStaffAssignment).where(RallyStaffAssignment.checkpoint_id == checkpoint.id)
        )
    ).all()
    assert [r.user_id for r in rows] == [b.id]


async def test_merge_leaves_email_less_rows_alone(pg_session):
    """Name-only placeholder members share nothing to merge on."""
    pg_session.add_all(
        [
            User(authentik_sub=None, name="Sem Email A", email=None, scopes=[]),
            User(authentik_sub=None, name="Sem Email B", email=None, scopes=[]),
        ]
    )
    await pg_session.commit()

    await _run_merge(pg_session)

    remaining = await pg_session.scalar(
        select(func.count()).select_from(User).where(User.email.is_(None))
    )
    assert remaining == 2


async def test_merge_is_a_no_op_without_duplicates(pg_session):
    await crud_user.create_for_oidc(
        pg_session, authentik_sub="solo-sub", name="Solo", email="solo@ua.pt", scopes=["admin"]
    )

    await _run_merge(pg_session)

    solo = await crud_user.get_by_email(pg_session, email="solo@ua.pt")
    assert solo is not None
    assert solo.authentik_sub == "solo-sub"
    assert solo.scopes == ["admin"]


async def test_schema_name_is_the_one_the_migration_targets():
    """0049 built its index for a table named ``users``; the model derives
    ``user``, so that migration silently no-opped. Guard the assumption."""
    assert User.__tablename__ == "user"
    assert app_settings.SCHEMA_NAME


# ---------- losing the Authentik group ----------


async def _list_staff(pg_session, members):
    """Drive the listing the admin screen calls, with a stubbed Authentik."""
    from unittest.mock import AsyncMock, patch

    from app.crud.crud_rally_staff_assignment import rally_staff_assignment
    from app.schemas.rally_staff_assignment import RallyStaffAssignmentWithCheckpoint
    from app.services.user_service import UserService

    with patch(
        "app.api.authentik_client.list_group_members",
        new=AsyncMock(return_value=members),
    ):
        return await UserService(pg_session).list_checkpoint_assignments(
            group="rally-staff",
            scope="rally-staff",
            assignment_crud=rally_staff_assignment,
            schema=RallyStaffAssignmentWithCheckpoint,
        )


class _Member:
    def __init__(self, name, email):
        self.name = name
        self.email = email


async def test_losing_the_group_removes_the_person_from_the_admin_list(pg_session):
    """Revoking the Authentik group must actually drop them from the listing,
    and take their checkpoint assignment with it — otherwise the post still
    looks staffed by someone who no longer has access."""
    checkpoint = await _make_checkpoint(pg_session, "Refúgio dos drinks", 1)
    keep = _Member("Fica", "fica@ua.pt")
    leave = _Member("Sai", "sai@ua.pt")

    listing = await _list_staff(pg_session, [keep, leave])
    assert {item.user_email for item in listing.items} == {"fica@ua.pt", "sai@ua.pt"}

    leaver = await crud_user.get_by_email(pg_session, email="sai@ua.pt")
    pg_session.add(RallyStaffAssignment(user_id=leaver.id, checkpoint_id=checkpoint.id))
    await pg_session.commit()

    # Same call, with that person no longer in the group.
    listing = await _list_staff(pg_session, [keep])

    assert {item.user_email for item in listing.items} == {"fica@ua.pt"}
    remaining = await pg_session.scalar(
        select(func.count())
        .select_from(RallyStaffAssignment)
        .where(RallyStaffAssignment.user_id == leaver.id)
    )
    assert remaining == 0
    await pg_session.refresh(leaver)
    assert leaver.scopes == []
    assert leaver.staff_checkpoint_id is None


async def test_group_membership_survives_an_email_case_difference(pg_session):
    """Authentik returns the address in whatever case the account carries; a
    raw comparison would read a current member as removed and revoke them."""
    await _list_staff(pg_session, [_Member("Maiúsculas", "MAIUSCULAS@ua.pt")])

    listing = await _list_staff(pg_session, [_Member("Maiúsculas", "MAIUSCULAS@ua.pt")])

    assert [item.user_email for item in listing.items] == ["maiusculas@ua.pt"]


async def test_empty_authentik_response_revokes_nobody(pg_session):
    """An empty list also means "the call failed"; mass-revoking on it would
    wipe every staff member's access on a transient API error."""
    await _list_staff(pg_session, [_Member("Presente", "presente@ua.pt")])

    listing = await _list_staff(pg_session, [])

    assert [item.user_email for item in listing.items] == ["presente@ua.pt"]
