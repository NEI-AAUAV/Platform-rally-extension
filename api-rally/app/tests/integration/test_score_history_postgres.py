"""Real-schema integration test for the score-history recording that powers the
post-event replay. Exercises ScoringService.update_team_scores writing a
TeamScoreHistory row when a team's total changes — only meaningful against a
real schema (the worker/scoring path the mock suite cannot run).
"""

import pytest
from sqlalchemy import select

from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.checkpoint import CheckPoint
from app.models.score_history import TeamScoreHistory
from app.models.team import Team
from app.services.scoring_service import ScoringService

pytestmark = pytest.mark.asyncio


async def _seed_completed_result(session, *, final_score: float) -> tuple[int, int]:
    """Create an event, team, checkpoint, activity and one completed result.

    Returns (event_id, team_id).
    """
    event = RallyEvent(name="Replay Edition", event_type="rally_tascas", is_current=True)
    session.add(event)
    await session.commit()
    await session.refresh(event)

    team = Team(name="History Team", access_code="HIS-0001", event_id=event.id)
    checkpoint = CheckPoint(name="CP1", order=1, event_id=event.id)
    session.add_all([team, checkpoint])
    await session.commit()
    await session.refresh(team)
    await session.refresh(checkpoint)

    activity = Activity(
        name="A1",
        activity_type="GeneralActivity",
        checkpoint_id=checkpoint.id,
        config={},
    )
    session.add(activity)
    await session.commit()
    await session.refresh(activity)

    session.add(
        ActivityResult(
            activity_id=activity.id,
            team_id=team.id,
            is_completed=True,
            final_score=final_score,
            result_data={},
        )
    )
    await session.commit()
    return event.id, team.id


async def test_update_team_scores_records_history(pg_session) -> None:
    """Updating a team's score appends one history snapshot with the new total."""
    event_id, team_id = await _seed_completed_result(pg_session, final_score=50.0)

    changed = await ScoringService(pg_session).update_team_scores(team_id)
    assert changed is True

    rows = (
        await pg_session.scalars(
            select(TeamScoreHistory).where(TeamScoreHistory.team_id == team_id)
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].total == 50
    assert rows[0].event_id == event_id


async def test_history_not_written_when_total_unchanged(pg_session) -> None:
    """A second update with no scoring change writes no further snapshot."""
    _, team_id = await _seed_completed_result(pg_session, final_score=50.0)
    service = ScoringService(pg_session)

    await service.update_team_scores(team_id)
    await service.update_team_scores(team_id)  # total stays 50 → no new row

    rows = (
        await pg_session.scalars(
            select(TeamScoreHistory).where(TeamScoreHistory.team_id == team_id)
        )
    ).all()
    assert len(rows) == 1
