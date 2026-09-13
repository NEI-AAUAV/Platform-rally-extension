"""Real-schema integration tests for team checkpoint progression.

``record_visit`` is the core write path of the rally: it claims the arrival
row (the idempotency token) and validates the event window and route order in
the same transaction. The mock suite can only assert around it; here it runs
against real Postgres.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.core.exceptions import RallyValidationError
from app.crud.crud_team import team as crud_team
from app.models.activity import RallyEvent
from app.models.checkpoint import CheckPoint
from app.models.rally_settings import RallySettings
from app.models.team import Team
from app.services.checkpoint_visits import record_visit

pytestmark = pytest.mark.asyncio


async def _setup_rally(pg_session, *, order_matters: bool = True):
    event = RallyEvent(name="Edition", event_type="rally_tascas", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)

    settings = RallySettings(event_id=event.id, checkpoint_order_matters=order_matters)
    cp1 = CheckPoint(name="CP1", order=1, event_id=event.id)
    cp2 = CheckPoint(name="CP2", order=2, event_id=event.id)
    team = Team(name="Team X", access_code="PRG-0001", event_id=event.id)
    pg_session.add_all([settings, cp1, cp2, team])
    await pg_session.commit()
    for obj in (cp1, cp2, team):
        await pg_session.refresh(obj)
    return event, settings, cp1, cp2, team


async def test_record_visit_in_order_moves_the_team_along(pg_session) -> None:
    from app.services.team_service import TeamService

    _, _, cp1, cp2, team = await _setup_rally(pg_session)

    assert await record_visit(pg_session, team_id=team.id, checkpoint_id=cp1.id) is True
    assert await record_visit(pg_session, team_id=team.id, checkpoint_id=cp2.id) is True

    detailed = await TeamService(db=pg_session, team_crud=crud_team).build_detailed_team(
        team, with_progress=True
    )
    assert [(row.checkpoint_id, row.status) for row in detailed.checkpoints] == [
        (cp1.id, "completed"),
        (cp2.id, "completed"),
    ]


async def test_arrival_times_survive_the_round_trip_as_instants(pg_session) -> None:
    """The visit stamp keeps its UTC offset all the way through Postgres, so
    the API never serves an offset-less string a browser reads as local time."""
    from app.services.team_service import TeamService

    _, _, cp1, _, team = await _setup_rally(pg_session)
    before = datetime.now(UTC)

    await record_visit(pg_session, team_id=team.id, checkpoint_id=cp1.id)

    detailed = await TeamService(db=pg_session, team_crud=crud_team).build_detailed_team(
        team, with_progress=True
    )
    stamped = detailed.checkpoints[0].arrived_at
    assert stamped is not None
    assert stamped.utcoffset() == timedelta(0)
    # arrived_at is the database's now(): allow for clock skew between the
    # test process and the Postgres container.
    assert abs(stamped - before) < timedelta(minutes=1)


async def test_record_visit_out_of_order_rejected(pg_session) -> None:
    _, _, _, cp2, team = await _setup_rally(pg_session, order_matters=True)

    with pytest.raises(RallyValidationError) as exc:
        await record_visit(pg_session, team_id=team.id, checkpoint_id=cp2.id)
    assert exc.value.status_code == 400


async def test_record_visit_twice_is_recorded_once(pg_session) -> None:
    """A second visit to the same post is swallowed, not double-counted.

    The arrival row's ``(team_id, checkpoint_id)`` unique constraint is the
    idempotency token for every check-in path.
    """
    _, _, cp1, _, team = await _setup_rally(pg_session)

    assert await record_visit(pg_session, team_id=team.id, checkpoint_id=cp1.id) is True
    assert await record_visit(pg_session, team_id=team.id, checkpoint_id=cp1.id) is False

    teams_here = await crud_team.get_by_checkpoint(pg_session, checkpoint_id=cp1.id)
    assert len(teams_here) == 1


async def test_record_visit_outside_rally_window_rejected(pg_session) -> None:
    event, _, cp1, _, team = await _setup_rally(pg_session)
    # The event is the source of truth for timing; get_or_create syncs the
    # settings row from it on every read.
    event.end_time = datetime.now(UTC) - timedelta(hours=1)
    await pg_session.commit()

    with pytest.raises(RallyValidationError) as exc:
        await record_visit(pg_session, team_id=team.id, checkpoint_id=cp1.id)
    assert exc.value.status_code == 400
    assert "ended" in str(exc.value).lower()


async def test_penalties_per_checkpoint_groups_hints_skips_and_activity(pg_session) -> None:
    from app.models.activity import Activity, ActivityResult
    from app.models.checkpoint_guide_indication import CheckpointGuideIndication
    from app.models.checkpoint_hint_reveal import CheckpointHintReveal
    from app.models.checkpoint_skip import CheckpointSkip
    from app.services.team_service import TeamService

    event, _, cp1, cp2, team = await _setup_rally(pg_session)

    # cp1: two hints bought (-3, -2) + an activity that deducted 4 points.
    activity = Activity(
        name="Shot", activity_type="GenericActivity", checkpoint_id=cp1.id, event_id=event.id
    )
    # The reveal rows carry a real FK to the indication they paid for, so the
    # ladder has to exist before they can be written.
    hint_a = CheckpointGuideIndication(checkpoint_id=cp1.id, hint="Primeira", order=0)
    hint_b = CheckpointGuideIndication(checkpoint_id=cp1.id, hint="Segunda", order=1)
    pg_session.add_all([activity, hint_a, hint_b])
    await pg_session.commit()
    for obj in (activity, hint_a, hint_b):
        await pg_session.refresh(obj)
    pg_session.add_all(
        [
            CheckpointHintReveal(
                team_id=team.id, checkpoint_id=cp1.id, indication_id=hint_a.id, cost=-3
            ),
            CheckpointHintReveal(
                team_id=team.id, checkpoint_id=cp1.id, indication_id=hint_b.id, cost=-2
            ),
            ActivityResult(activity_id=activity.id, team_id=team.id, penalties={"vomit": 4}),
            # cp2: the team gave up.
            CheckpointSkip(team_id=team.id, checkpoint_id=cp2.id, cost=-8),
        ]
    )
    await pg_session.commit()

    service = TeamService(db=pg_session, team_crud=crud_team)
    detailed = await service.build_detailed_team(team, with_progress=True)

    by_order = {p.checkpoint_order: p for p in detailed.penalties_per_checkpoint}
    assert set(by_order) == {1, 2}
    assert by_order[1].hints_cost == -5
    assert by_order[1].activity_penalties == -4
    assert by_order[1].skip_cost == 0
    assert by_order[1].total == -9
    assert by_order[2].skip_cost == -8
    assert by_order[2].total == -8


async def test_penalties_per_checkpoint_empty_when_scores_hidden(pg_session) -> None:
    from app.models.checkpoint_skip import CheckpointSkip
    from app.services.team_service import TeamService

    _, _, cp1, _, team = await _setup_rally(pg_session)
    pg_session.add(CheckpointSkip(team_id=team.id, checkpoint_id=cp1.id, cost=-8))
    await pg_session.commit()

    service = TeamService(db=pg_session, team_crud=crud_team)
    detailed = await service.build_detailed_team(team, with_progress=True, hide_scores=True)

    assert detailed.penalties_per_checkpoint == []
