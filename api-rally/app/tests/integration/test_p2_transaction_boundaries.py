"""P2 regression tests: hidden-commit / cross-edition / race hardening.

Real Postgres only (advisory locks, savepoints, genuine concurrent writers);
skips without it.
"""

import asyncio

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.crud.crud_rally_guide_assignment import rally_guide_assignment
from app.crud.crud_rally_settings import rally_settings
from app.models.activity import RallyEvent
from app.models.badge import TeamBadge
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.rally_settings import RallySettings
from app.models.team import Team
from app.services import badge_service

pytestmark = pytest.mark.asyncio


async def _event(pg_session, name: str, *, current: bool) -> RallyEvent:
    ev = RallyEvent(name=name, event_type="rally_tascas", is_current=current)
    pg_session.add(ev)
    await pg_session.commit()
    await pg_session.refresh(ev)
    return ev


# --------------------------------------------------------------------------- #
# P2a — rally_settings.get_or_create no longer commits on the hot read path
# --------------------------------------------------------------------------- #
async def test_get_or_create_does_not_commit_callers_pending_work(pg_session):
    await _event(pg_session, "Edição", current=True)
    # Prime the row so this call takes the "already exists" fast path.
    await rally_settings.get_or_create(pg_session)

    # Caller stages a row, then calls get_or_create as if it were a plain read.
    pending = Team(name="Pending Team", access_code="P2-PEND", event_id=None)
    pg_session.add(pending)
    await pg_session.flush()

    await rally_settings.get_or_create(pg_session)

    # If get_or_create had committed, this rollback could not undo the team.
    await pg_session.rollback()
    assert await pg_session.scalar(
        select(func.count()).select_from(Team).where(Team.access_code == "P2-PEND")
    ) == 0


# --------------------------------------------------------------------------- #
# P2b — single-holder badge: concurrent workers, different teams, one winner
# --------------------------------------------------------------------------- #
async def test_single_holder_badge_survives_concurrent_award_for_two_teams(
    pg_session, _pg_engine
):
    event = await _event(pg_session, "Badge Edição", current=True)
    pg_session.add(RallySettings(event_id=event.id))
    team_a = Team(name="BA", access_code="P2-BA", event_id=event.id)
    team_b = Team(name="BB", access_code="P2-BB", event_id=event.id)
    pg_session.add_all([team_a, team_b])
    await pg_session.commit()
    await pg_session.refresh(team_a)
    await pg_session.refresh(team_b)

    maker = async_sessionmaker(_pg_engine, expire_on_commit=False)

    async def _award(team_id: int) -> bool:
        async with maker() as session:
            badge = await badge_service.award_single_holder_badge(
                session,
                team_id=team_id,
                badge_code="FIRST_TO_COMPLETE",
                activity_id=99,
            )
            return badge is not None

    results = await asyncio.gather(_award(team_a.id), _award(team_b.id))

    assert results.count(True) == 1, "exactly one team may win a single-holder badge"
    async with maker() as session:
        holders = await session.scalar(
            select(func.count())
            .select_from(TeamBadge)
            .where(TeamBadge.badge_type == "FIRST_TO_COMPLETE", TeamBadge.activity_id == 99)
        )
    assert holders == 1


# --------------------------------------------------------------------------- #
# P2c — guide assignment is per-edition, not global
# --------------------------------------------------------------------------- #
async def test_guide_assignment_returning_guide_gets_current_edition_row(pg_session):
    old_event = await _event(pg_session, "2025", current=False)
    new_event = await _event(pg_session, "2026", current=True)

    old_team = Team(name="Old", access_code="P2-GOLD", event_id=old_event.id)
    new_team = Team(name="New", access_code="P2-GNEW", event_id=new_event.id)
    pg_session.add_all([old_team, new_team])
    await pg_session.commit()
    await pg_session.refresh(old_team)
    await pg_session.refresh(new_team)

    # Guide worked the 2025 edition.
    stale = RallyGuideAssignment(user_id=4242, team_id=old_team.id)
    pg_session.add(stale)
    await pg_session.commit()

    # Lookup for the current event must not surface the finished edition's row.
    assert await rally_guide_assignment.get_by_user_id(pg_session, 4242) is None

    # ...and assigning them now creates a fresh row instead of repointing 2025.
    created = await rally_guide_assignment.create_or_update(
        pg_session, user_id=4242, team_id=new_team.id
    )
    assert created is not None
    assert created.id != stale.id
    assert created.team_id == new_team.id

    await pg_session.refresh(stale)
    assert stale.team_id == old_team.id  # untouched

    rows = await pg_session.scalar(
        select(func.count())
        .select_from(RallyGuideAssignment)
        .where(RallyGuideAssignment.user_id == 4242)
    )
    assert rows == 2


# --------------------------------------------------------------------------- #
# P2d — idempotency reservation race no longer rolls back caller's staged work
# --------------------------------------------------------------------------- #
async def test_reservation_loss_does_not_discard_caller_pending_rows(pg_session, monkeypatch):
    import app.api.api_v1.idempotency as idem
    from app.api.api_v1.idempotency import compute_fingerprint, reserve_idempotency_key
    from app.models.idempotency_key import IdempotencyKey

    await _event(pg_session, "Idem Edição", current=True)
    fp = compute_fingerprint({"team_id": 1})
    key = "p2-reserve-race"

    # The key already exists (a concurrent writer committed it first).
    pg_session.add(
        IdempotencyKey(
            endpoint="evaluate_team_activity",
            idempotency_key=key,
            request_fingerprint=fp,
            response_body={"ok": True},
            status_code=200,
            completed_at=func.now(),
        )
    )
    await pg_session.commit()

    # Caller stages domain work first.
    pending = Team(name="Idem Pending", access_code="P2-IDEM", event_id=None)
    pg_session.add(pending)
    await pg_session.flush()

    # Force the first-seen check to miss so the insert path runs and hits the
    # unique violation — exactly the race the savepoint must contain.
    real_existing = idem._existing
    calls = {"n": 0}

    async def _existing_first_miss(db, *, endpoint, key):
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return await real_existing(db, endpoint=endpoint, key=key)

    monkeypatch.setattr(idem, "_existing", _existing_first_miss)

    reservation = await reserve_idempotency_key(
        pg_session, endpoint="evaluate_team_activity", key=key, fingerprint=fp
    )

    # Loser replays the winner's row...
    assert reservation.replay is not None
    # ...and the savepoint rolled back only the failed insert, not the team.
    assert await pg_session.scalar(
        select(func.count()).select_from(Team).where(Team.access_code == "P2-IDEM")
    ) == 1
