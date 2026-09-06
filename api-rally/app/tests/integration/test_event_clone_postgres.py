"""Real-schema tests for cloning one edition's structure into another.

Editions are isolated, so a new event starts empty. Cloning is how an admin
seeds next year's route from last year's without sharing rows: the copy must be
independent, and it must not drag along anything that *happened* in the source.
"""

import pytest
from sqlalchemy import func, select

from app.core.exceptions import RallyValidationError
from app.models.activity import Activity, RallyEvent
from app.models.badge_definition import BadgeDefinition
from app.models.checkpoint import CheckPoint
from app.models.dynamic_scoring import DynamicRule
from app.models.route_stage import RouteStage
from app.models.team import Team
from app.services.event_service import EventService

pytestmark = pytest.mark.asyncio


async def _make_event(session, name: str, *, is_current: bool = False) -> RallyEvent:
    event = RallyEvent(name=name, event_type="rally_tascas", is_current=is_current)
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


async def _populate(session, event: RallyEvent) -> CheckPoint:
    """Give ``event`` a small but complete structure, plus a team and a stage."""
    stage = RouteStage(name="Stage 1", order=1, event_id=event.id)
    session.add(stage)
    await session.flush()

    checkpoint = CheckPoint(
        name="Tasca do Zé",
        order=1,
        arrival_radius_m=40,
        event_id=event.id,
        stage_id=stage.id,
    )
    session.add(checkpoint)
    await session.flush()

    session.add_all(
        [
            Activity(
                name="Shot",
                activity_type="score_based",
                checkpoint_id=checkpoint.id,
                event_id=event.id,
                config={},
            ),
            BadgeDefinition(code="first_blood", name="Primeiro", event_id=event.id),
            DynamicRule(name="Bonus", event_id=event.id),
            # Teams and their results are what *happened* in this edition.
            Team(name="Os Bêbados", access_code=f"SRC-{event.id}", event_id=event.id),
        ]
    )
    await session.commit()
    await session.refresh(checkpoint)
    return checkpoint


async def test_clone_copies_structure_as_new_rows(pg_session) -> None:
    source = await _make_event(pg_session, "2025", is_current=True)
    source_checkpoint = await _populate(pg_session, source)
    target = await _make_event(pg_session, "2026")

    created = await EventService(pg_session).clone_structure(target.id, source.id)

    assert created["checkpoints"] == 1
    assert created["activities"] == 1
    assert created["route_stages"] == 1
    assert created["badge_definitions"] == 1
    assert created["dynamic_rules"] == 1

    clone = await pg_session.scalar(select(CheckPoint).where(CheckPoint.event_id == target.id))
    assert clone is not None
    assert clone.id != source_checkpoint.id  # a copy, never the same row
    assert clone.name == source_checkpoint.name
    assert clone.arrival_radius_m == 40

    # The activity follows its checkpoint into the new edition.
    activity = await pg_session.scalar(select(Activity).where(Activity.event_id == target.id))
    assert activity.checkpoint_id == clone.id

    # The stage was recreated too, and the copy points at the copy.
    stage = await pg_session.scalar(select(RouteStage).where(RouteStage.event_id == target.id))
    assert clone.stage_id == stage.id


async def test_clone_leaves_the_source_edition_untouched(pg_session) -> None:
    source = await _make_event(pg_session, "2025", is_current=True)
    source_checkpoint = await _populate(pg_session, source)
    target = await _make_event(pg_session, "2026")

    await EventService(pg_session).clone_structure(target.id, source.id)

    await pg_session.refresh(source_checkpoint)
    assert source_checkpoint.event_id == source.id
    assert (
        await pg_session.scalar(
            select(func.count(CheckPoint.id)).where(CheckPoint.event_id == source.id)
        )
        == 1
    )


async def test_clone_never_copies_teams(pg_session) -> None:
    """Teams and everything they did stay in the edition where it happened."""
    source = await _make_event(pg_session, "2025", is_current=True)
    await _populate(pg_session, source)
    target = await _make_event(pg_session, "2026")

    await EventService(pg_session).clone_structure(target.id, source.id)

    assert (
        await pg_session.scalar(select(func.count(Team.id)).where(Team.event_id == target.id)) == 0
    )


async def test_clone_refuses_a_target_that_already_has_a_route(pg_session) -> None:
    source = await _make_event(pg_session, "2025", is_current=True)
    await _populate(pg_session, source)
    target = await _make_event(pg_session, "2026")
    service = EventService(pg_session)
    await service.clone_structure(target.id, source.id)

    # A second clone would stack a duplicate route on top of the first.
    with pytest.raises(RallyValidationError):
        await service.clone_structure(target.id, source.id)


async def test_clone_refuses_the_same_event(pg_session) -> None:
    event = await _make_event(pg_session, "2025", is_current=True)

    with pytest.raises(RallyValidationError):
        await EventService(pg_session).clone_structure(event.id, event.id)
