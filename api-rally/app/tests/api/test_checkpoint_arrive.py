"""Tests for GPS geofence arrive endpoint (A2), against a real Postgres schema."""

from unittest.mock import AsyncMock, patch

from sqlalchemy import select

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.models.activity import Activity, EventType, RallyEvent
from app.models.team import Team
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.tests.conftest import as_team


async def _reread_team(pg_session, team_id: int) -> Team:
    """Fresh SELECT instead of crud_team.get(): the request that mutated this
    row committed on a different session, so pg_session's identity map still
    holds the pre-request `Team` instance. A plain `select()` by primary key
    returns that same cached object rather than the new row — SQLAlchemy's
    identity map wins over the query unless told otherwise — so this forces a
    real reload with `populate_existing`.
    """
    stmt = select(Team).where(Team.id == team_id).execution_options(populate_existing=True)
    return (await pg_session.scalars(stmt)).one()


async def _make_event(pg_session, event_type=EventType.PEDDY_PAPER.value):
    event = RallyEvent(name="Test Event", is_current=True, event_type=event_type)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_checkpoint(pg_session, order=1, lat=41.0, lon=-8.0, radius=50):
    return await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name=f"Checkpoint {order}",
            order=order,
            latitude=lat,
            longitude=lon,
            arrival_radius_m=radius,
        ),
    )


async def _make_team(pg_session):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name="TeamA"))


async def _make_activity(pg_session, checkpoint_id, is_active=True):
    activity_obj = Activity(
        checkpoint_id=checkpoint_id,
        is_active=is_active,
        name="Activity",
        activity_type="generic",
    )
    pg_session.add(activity_obj)
    await pg_session.commit()
    await pg_session.refresh(activity_obj)
    return activity_obj


async def test_arrive_within_radius(pg_session, pg_client):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    team = await _make_team(pg_session)
    await _make_activity(pg_session, checkpoint.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["already_registered"] is False
    assert data["team_id"] == team.id
    assert data["checkpoint_id"] == checkpoint.id
    assert data["distance_m"] < 10
    # Checkpoint has an active activity → no auto-complete on arrival
    assert data["auto_completed"] is False


async def test_arrive_too_far(pg_session, pg_client):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, radius=50)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
            # 500m north
            json={"latitude": 41.0045, "longitude": -8.0},
        )

    assert resp.status_code == 400
    assert "Too far" in resp.json()["detail"]


async def test_arrive_wrong_event_type(pg_session, pg_client):
    await _make_event(pg_session, event_type=EventType.RALLY_TASCAS.value)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
            json={"latitude": 41.0, "longitude": -8.0},
        )

    assert resp.status_code == 400
    assert "Peddy Paper" in resp.json()["detail"]


async def test_arrive_checkpoint_not_found(pg_session, pg_client):
    await _make_event(pg_session)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            "/api/rally/v1/checkpoint/999999/arrive",
            json={"latitude": 41.0, "longitude": -8.0},
        )

    assert resp.status_code == 404


async def test_arrive_no_activities_auto_completes(pg_session, pg_client):
    """Checkpoint with no activities: arrival marks it done and advances."""
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )

    assert resp.status_code == 200, resp.text
    assert resp.json()["auto_completed"] is True

    refreshed = await _reread_team(pg_session, team.id)
    assert len(refreshed.times) == 1


async def test_arrive_auto_complete_swallows_checkin_failure(pg_session, pg_client):
    """`_auto_complete_if_no_activities` is best-effort: if advancing the team
    raises, the arrival itself still succeeds with auto_completed=False."""
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    team = await _make_team(pg_session)

    with (
        patch(
            "app.services.checkpoint_arrival_service.checkin_team_to_checkpoint",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ),
        as_team(team.id, "TeamA"),
    ):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )

    assert resp.status_code == 200, resp.text
    assert resp.json()["auto_completed"] is False


async def test_arrive_repeat_is_idempotent_via_integrity_error(pg_session, pg_client):
    """A concurrent duplicate arrival insert violates the unique constraint;
    the endpoint catches IntegrityError and reports already_registered=True
    instead of failing the request. Simulated directly by calling the route
    function with a mocked `already_registered` SELECT (real DB unique
    constraint then raises IntegrityError on the real INSERT/commit)."""
    from app.api.api_v1.checkpoint_arrive import ArriveRequest, CheckpointArriveController
    from app.models.checkpoint_arrival import CheckpointArrival
    from app.schemas.team_auth import TeamTokenData
    from app.services.checkpoint_arrival_service import CheckpointArrivalService

    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    team = await _make_team(pg_session)
    await _make_activity(pg_session, checkpoint.id)

    # Pre-existing row: the real unique constraint will reject a second insert
    # for this (team_id, checkpoint_id) pair.
    pg_session.add(
        CheckpointArrival(
            team_id=team.id,
            checkpoint_id=checkpoint.id,
            latitude=41.0,
            longitude=-8.0,
        )
    )
    await pg_session.commit()

    class _EmptyScalars:
        def first(self):
            return None

    class _EmptyResult:
        def scalars(self):
            return _EmptyScalars()

    real_execute = pg_session.execute

    async def _selective_execute(stmt, *args, **kwargs):
        # Only fake out the "already registered" arrival lookup; every other
        # query (current event, checkpoint, etc.) runs for real.
        compiled = str(stmt)
        if "checkpoint_arrivals" in compiled.lower():
            return _EmptyResult()
        return await real_execute(stmt, *args, **kwargs)

    with patch.object(pg_session, "execute", new=AsyncMock(side_effect=_selective_execute)):
        response = await CheckpointArriveController().arrive_at_checkpoint(
            checkpoint_id=checkpoint.id,
            body=ArriveRequest(latitude=41.000045, longitude=-8.0),
            db=pg_session,
            team=TeamTokenData(team_id=team.id, team_name="TeamA"),
            service=CheckpointArrivalService(pg_session),
        )

    assert response.already_registered is True


async def test_arrive_no_activities_out_of_order_does_not_advance(pg_session, pg_client):
    """No-activity checkpoint but team is not yet due here: no auto-advance."""
    await _make_event(pg_session)
    await _make_checkpoint(pg_session, order=1)
    await _make_checkpoint(pg_session, order=2)
    checkpoint_3 = await _make_checkpoint(pg_session, order=3, lat=43.0, lon=-9.0)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint_3.id}/arrive",
            json={"latitude": 43.000045, "longitude": -9.0},
        )

    assert resp.status_code == 200, resp.text
    assert resp.json()["auto_completed"] is False

    refreshed = await _reread_team(pg_session, team.id)
    assert len(refreshed.times) == 0
