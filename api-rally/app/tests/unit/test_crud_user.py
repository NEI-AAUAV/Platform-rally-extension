"""DB-backed tests for app.crud.crud_user (real Postgres via pg_session)."""
import pytest

from app.core.exceptions import RallyNotFoundError
from app.crud.crud_user import user as crud_user
from app.schemas.user import UserCreate, UserUpdate


async def test_get_by_authentik_sub_found_and_missing(pg_session):
    created = await crud_user.create(
        pg_session, obj_in=UserCreate(name="Ana Sub")
    )
    created.authentik_sub = "sub-123"
    pg_session.add(created)
    await pg_session.commit()

    found = await crud_user.get_by_authentik_sub(pg_session, authentik_sub="sub-123")
    assert found is not None
    assert found.id == created.id

    missing = await crud_user.get_by_authentik_sub(pg_session, authentik_sub="nope")
    assert missing is None


async def test_get_by_authentik_subs_empty_list_short_circuits(pg_session):
    result = await crud_user.get_by_authentik_subs(pg_session, authentik_subs=[])
    assert result == []


async def test_get_by_authentik_subs_returns_matches(pg_session):
    a = await crud_user.create(pg_session, obj_in=UserCreate(name="Bea Subs"))
    a.authentik_sub = "sub-a"
    b = await crud_user.create(pg_session, obj_in=UserCreate(name="Cid Subs"))
    b.authentik_sub = "sub-b"
    pg_session.add_all([a, b])
    await pg_session.commit()

    results = await crud_user.get_by_authentik_subs(
        pg_session, authentik_subs=["sub-a", "sub-b", "sub-missing"]
    )
    assert {u.id for u in results} == {a.id, b.id}


async def test_search_oidc_users_matches_name_and_email(pg_session):
    linked = await crud_user.create(
        pg_session, obj_in=UserCreate(name="Diana Oidc", email="diana@example.com")
    )
    linked.authentik_sub = "sub-diana"
    pg_session.add(linked)
    unlinked = await crud_user.create(pg_session, obj_in=UserCreate(name="Diana Ghost"))
    await pg_session.commit()

    results = await crud_user.search_oidc_users(pg_session, q="diana")
    ids = {u.id for u in results}
    assert linked.id in ids
    assert unlinked.id not in ids


async def test_create_for_oidc_creates_user(pg_session):
    created = await crud_user.create_for_oidc(
        pg_session,
        authentik_sub="sub-new",
        name="Eve New",
        email="eve@example.com",
        scopes=["staff"],
    )
    assert created.id is not None
    assert created.authentik_sub == "sub-new"
    assert created.scopes == ["staff"]


async def test_get_by_email_found_and_missing(pg_session):
    created = await crud_user.create(
        pg_session, obj_in=UserCreate(name="Finn Email", email="finn@example.com")
    )

    found = await crud_user.get_by_email(pg_session, email="finn@example.com")
    assert found is not None
    assert found.id == created.id

    missing = await crud_user.get_by_email(pg_session, email="nobody@example.com")
    assert missing is None


async def test_get_or_create_mirror_creates_when_absent(pg_session):
    mirror = await crud_user.get_or_create_mirror(
        pg_session, name="Gia Mirror", email="gia@example.com", scope="guide"
    )
    assert mirror.id is not None
    assert mirror.scopes == ["guide"]
    assert mirror.authentik_sub is None


async def test_get_or_create_mirror_adds_new_scope_to_existing(pg_session):
    existing = await crud_user.create(
        pg_session, obj_in=UserCreate(name="Hal Mirror", email="hal@example.com")
    )
    existing.scopes = ["guide"]
    pg_session.add(existing)
    await pg_session.commit()

    mirror = await crud_user.get_or_create_mirror(
        pg_session, name="Hal Mirror", email="hal@example.com", scope="staff"
    )
    assert mirror.id == existing.id
    assert set(mirror.scopes) == {"guide", "staff"}


async def test_get_or_create_mirror_no_op_when_scope_present(pg_session):
    existing = await crud_user.create(
        pg_session, obj_in=UserCreate(name="Ivy Mirror", email="ivy@example.com")
    )
    existing.scopes = ["guide"]
    pg_session.add(existing)
    await pg_session.commit()

    mirror = await crud_user.get_or_create_mirror(
        pg_session, name="Ivy Mirror", email="ivy@example.com", scope="guide"
    )
    assert mirror.id == existing.id
    assert mirror.scopes == ["guide"]


async def test_create_raises_not_found_for_invalid_team(pg_session):
    with pytest.raises(RallyNotFoundError):
        await crud_user.create(
            pg_session, obj_in=UserCreate(name="Jack Orphan", team_id=999999)
        )


async def test_update_raises_not_found_for_invalid_team(pg_session):
    created = await crud_user.create(pg_session, obj_in=UserCreate(name="Kim Update"))

    with pytest.raises(RallyNotFoundError):
        await crud_user.update(
            pg_session,
            id=created.id,
            obj_in=UserUpdate(team_id=999999),
        )
