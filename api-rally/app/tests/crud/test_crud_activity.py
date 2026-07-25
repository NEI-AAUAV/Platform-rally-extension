"""DB-backed tests for CRUDActivity / CRUDActivityResult / CRUDRallyEvent
gaps not already covered by test_event_editions.py (against real Postgres).
"""

from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_activity import activity_result as crud_activity_result
from app.crud.crud_activity import rally_event as crud_rally_event
from app.crud.crud_team import team as crud_team
from app.models.activity import EventType
from app.schemas.activity import (
    ActivityCreate,
    ActivityResultCreate,
    RallyEventCreate,
    RallyEventUpdate,
)
from app.schemas.activity_types import ActivityType
from app.schemas.team import TeamCreate


async def _make_activity(pg_session, name="Shot Relâmpago"):
    return await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name=name,
            activity_type=ActivityType.GENERAL,
            config={"min_points": 0, "max_points": 100},
        ),
    )


async def test_remove_activity_missing_returns_none(pg_session) -> None:
    result = await crud_activity.remove(pg_session, id=999999)

    assert result is None


async def test_remove_activity_existing_deletes_and_returns_it(pg_session) -> None:
    created = await _make_activity(pg_session)

    removed = await crud_activity.remove(pg_session, id=created.id)

    assert removed is not None
    assert removed.id == created.id
    assert await crud_activity.get(pg_session, created.id) is None


async def test_activity_result_get_by_activity_returns_results_ordered(pg_session) -> None:
    act = await _make_activity(pg_session)
    team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Team A"))
    result = crud_activity_result.build(
        ActivityResultCreate(
            activity_id=act.id, team_id=team.id, result_data={"assigned_points": 10}
        ),
        final_score=10.0,
    )
    await crud_activity_result.persist(pg_session, result)

    results = await crud_activity_result.get_by_activity(pg_session, act.id)

    assert len(results) == 1
    assert results[0].activity_id == act.id


async def test_activity_result_get_by_team_returns_results_ordered(pg_session) -> None:
    act = await _make_activity(pg_session)
    team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Team B"))
    result = crud_activity_result.build(
        ActivityResultCreate(
            activity_id=act.id, team_id=team.id, result_data={"assigned_points": 5}
        ),
        final_score=5.0,
    )
    await crud_activity_result.persist(pg_session, result)

    results = await crud_activity_result.get_by_team(pg_session, team.id)

    assert len(results) == 1
    assert results[0].team_id == team.id


async def test_activity_result_get_all_returns_every_result(pg_session) -> None:
    act = await _make_activity(pg_session)
    team = await crud_team.create(pg_session, obj_in=TeamCreate(name="Team C"))
    result = crud_activity_result.build(
        ActivityResultCreate(
            activity_id=act.id, team_id=team.id, result_data={"assigned_points": 1}
        ),
        final_score=1.0,
    )
    await crud_activity_result.persist(pg_session, result)

    results = await crud_activity_result.get_all(pg_session)

    assert any(r.team_id == team.id for r in results)


async def test_rally_event_update_with_event_type_enum_stores_its_value(pg_session) -> None:
    event = await crud_rally_event.create(
        pg_session, obj_in=RallyEventCreate(name="Enum Update Event")
    )

    updated = await crud_rally_event.update(
        pg_session,
        db_obj=event,
        obj_in=RallyEventUpdate(event_type=EventType.RALLY_TASCAS),
    )

    assert updated.event_type == EventType.RALLY_TASCAS.value


async def test_remove_rally_event_missing_returns_none(pg_session) -> None:
    result = await crud_rally_event.remove(pg_session, id=999999)

    assert result is None


async def test_remove_rally_event_existing_deletes_and_returns_it(pg_session) -> None:
    event = await crud_rally_event.create(pg_session, obj_in=RallyEventCreate(name="To Delete"))

    removed = await crud_rally_event.remove(pg_session, id=event.id)

    assert removed is not None
    assert removed.id == event.id
    assert await crud_rally_event.get(pg_session, event.id) is None
