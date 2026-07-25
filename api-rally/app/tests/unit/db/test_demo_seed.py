"""DB-backed tests for the demo seed (real Postgres via pg_session)."""

import random

import pytest
from sqlalchemy import func, select

from app.db import demo_seed as demo_seed_module
from app.db.demo_seed import DEMO_TEAM_PREFIX, seed_demo
from app.models.activity import Activity, ActivityResult
from app.models.badge import TeamBadge
from app.models.evaluation_history import EvaluationHistory
from app.models.team import Team
from app.schemas.activity_types import ActivityType


async def _count(db, model):
    return await db.scalar(select(func.count(model.id)))


async def test_seed_demo_populates_data(pg_session):
    await seed_demo(pg_session, force=True)

    teams = await _count(pg_session, Team)
    assert teams > 0
    # Every team is tagged so demo data is easy to spot and purge.
    demo_teams = await pg_session.scalar(
        select(func.count(Team.id)).where(Team.name.like(f"{DEMO_TEAM_PREFIX}%"))
    )
    assert demo_teams == teams

    assert await _count(pg_session, ActivityResult) > 0
    # The seed edits one result so the audit trail has something to show.
    assert await _count(pg_session, EvaluationHistory) >= 1
    assert await _count(pg_session, TeamBadge) >= 1


async def test_seed_demo_is_idempotent(pg_session):
    await seed_demo(pg_session, force=True)
    first = await _count(pg_session, Team)

    # Re-running detects the demo teams and skips — no duplicates.
    await seed_demo(pg_session, force=True)
    assert await _count(pg_session, Team) == first


def test_result_data_for_unknown_activity_type_returns_empty_dict():
    """Any seeded type other than GENERAL/SCORE_BASED yields no result data —
    scorers tolerate missing data for these (e.g. TEAM_VS, DEFERRED_JUDGED)."""
    activity = Activity(
        name="Mystery",
        activity_type=ActivityType.TEAM_VS.value,
        config={},
        checkpoint_id=1,
    )
    rng = random.Random(1)

    assert demo_seed_module._result_data_for(activity, rng) == {}


async def test_seed_demo_refuses_in_production_without_override(
    monkeypatch: pytest.MonkeyPatch, pg_session
):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("DEMO_SEED_ALLOW", raising=False)

    with pytest.raises(RuntimeError, match="Refusing to run demo seed in production"):
        await seed_demo(pg_session, force=False)


async def test_seed_demo_allowed_in_production_with_override(
    monkeypatch: pytest.MonkeyPatch, pg_session
):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEMO_SEED_ALLOW", "1")

    # Should not raise despite ENVIRONMENT=production, since DEMO_SEED_ALLOW=1.
    await seed_demo(pg_session, force=False)

    assert await _count(pg_session, Team) > 0


async def test_seed_audit_trail_demo_noop_when_no_demo_result_exists(pg_session):
    """No `[DEMO] ` team/result exists yet, so the audit-trail helper should
    return early without raising (covers the `result is None` guard)."""
    rng = random.Random(1)

    # Should not raise even though there is nothing to edit.
    await demo_seed_module._seed_audit_trail_demo(pg_session, rng)


async def test_seed_badges_noop_when_no_teams_or_activities(pg_session):
    """No demo teams/activities exist yet, so `_seed_badges` should return
    early without attempting to award anything (covers the guard clause)."""
    await demo_seed_module._seed_badges(pg_session, activities=[])
