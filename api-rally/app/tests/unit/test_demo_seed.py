"""DB-backed tests for the demo seed (real Postgres via pg_session)."""
from sqlalchemy import func, select

from app.db.demo_seed import DEMO_TEAM_PREFIX, seed_demo
from app.models.activity import ActivityResult
from app.models.badge import TeamBadge
from app.models.evaluation_history import EvaluationHistory
from app.models.team import Team


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
