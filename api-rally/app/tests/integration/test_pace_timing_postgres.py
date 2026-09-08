"""Real-schema tests for what the race clock starts and stops on.

``compute_paces`` reads three ledgers (arrivals, scored results, skips) with
SQL aggregates, so the interesting behaviour — which timestamp wins — only
shows against real Postgres.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.rally_settings import RallySettings
from app.models.team import Team
from app.services.pace_service import compute_paces

pytestmark = pytest.mark.asyncio

START = datetime(2026, 5, 1, 14, tzinfo=UTC)


async def _setup(pg_session):
    event = RallyEvent(
        name="Edition",
        event_type="rally_tascas",
        is_current=True,
        start_time=START - timedelta(hours=2),
    )
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)

    settings = RallySettings(event_id=event.id, rally_start_time=START - timedelta(hours=2))
    cp = CheckPoint(name="CP1", order=1, event_id=event.id)
    team = Team(name="Team X", access_code="PACE-001", event_id=event.id, start_offset_minutes=30)
    pg_session.add_all([settings, cp, team])
    await pg_session.commit()
    for obj in (settings, cp, team):
        await pg_session.refresh(obj)

    activity = Activity(
        name="Prova",
        activity_type="GeneralActivity",
        checkpoint_id=cp.id,
        event_id=event.id,
        config={},
    )
    pg_session.add(activity)
    await pg_session.commit()
    await pg_session.refresh(activity)
    return settings, cp, team, activity


async def _pace_for(pg_session, settings, team):
    paces = await compute_paces(pg_session, settings)
    return next(pace for pace in paces if pace.team_id == team.id)


async def test_clock_runs_from_arrival_to_evaluation_not_from_the_event_start(pg_session) -> None:
    """The team's own time: it starts when the team reaches the post — not at
    the event's start, and not shifted by its staggered-start offset — and it
    stops when staff submit the evaluation."""
    settings, cp, team, activity = await _setup(pg_session)
    pg_session.add(CheckpointArrival(team_id=team.id, checkpoint_id=cp.id, arrived_at=START))
    pg_session.add(
        ActivityResult(
            team_id=team.id,
            activity_id=activity.id,
            result_data={},
            is_completed=True,
            final_score=100,
            completed_at=START + timedelta(minutes=20),
        )
    )
    await pg_session.commit()

    pace = await _pace_for(pg_session, settings, team)

    assert pace.started_at == START
    assert pace.elapsed_seconds == 20 * 60


async def test_deferred_judging_stops_the_clock_at_the_capture(pg_session) -> None:
    """A panel scoring the media hours later must not extend the team's time:
    the capture at the post is when the team was done."""
    settings, cp, team, activity = await _setup(pg_session)
    captured_at = START + timedelta(minutes=15)
    pg_session.add(CheckpointArrival(team_id=team.id, checkpoint_id=cp.id, arrived_at=START))
    pg_session.add(
        ActivityResult(
            team_id=team.id,
            activity_id=activity.id,
            result_data={},
            media_urls=["https://example.invalid/clip.mp4"],
            judgment_status="judged",
            is_completed=True,
            final_score=80,
            created_at=captured_at,
            completed_at=START + timedelta(hours=5),
        )
    )
    await pg_session.commit()

    pace = await _pace_for(pg_session, settings, team)

    assert pace.last_progress_at == captured_at
    assert pace.elapsed_seconds == 15 * 60


async def test_a_team_with_no_arrival_has_no_time(pg_session) -> None:
    settings, _, team, _ = await _setup(pg_session)

    pace = await _pace_for(pg_session, settings, team)

    assert pace.started_at is None
    assert pace.elapsed_seconds is None
