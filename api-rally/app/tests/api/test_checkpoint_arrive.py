"""Tests for GPS geofence arrive endpoint (A2), against a real Postgres schema."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

from sqlalchemy import select

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.models.activity import Activity, EventType, RallyEvent
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.dynamic_scoring import DynamicAward
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


async def _make_event(
    pg_session, event_type=EventType.PEDDY_PAPER.value, *, name="Test Event", is_current=True
):
    event = RallyEvent(name=name, is_current=is_current, event_type=event_type)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_checkpoint(pg_session, order=1, lat=41.0, lon=-8.0, radius=50, event_id=None):
    obj = await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name=f"Checkpoint {order}",
            order=order,
            latitude=lat,
            longitude=lon,
            arrival_radius_m=radius,
        ),
        commit=True,
    )
    # CheckPointCreate has no event_id field; set it directly so scoping tests
    # exercise real event-bound rows rather than legacy NULLs.
    if event_id is not None:
        obj.event_id = event_id
        pg_session.add(obj)
        await pg_session.commit()
        await pg_session.refresh(obj)
    return obj


async def _make_team(pg_session, name="TeamA", event_id=None):
    obj = await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)
    if event_id is not None:
        obj.event_id = event_id
        pg_session.add(obj)
        await pg_session.commit()
        await pg_session.refresh(obj)
    return obj


async def _set_settings(pg_session, **overrides):
    """Full-object PUT semantics: rebuild the row from its current values with
    the given overrides applied."""
    from app.crud.crud_rally_settings import rally_settings
    from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate

    current = await rally_settings.get_or_create(pg_session)
    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return await rally_settings.update(
        pg_session, id=current.id, obj_in=RallySettingsUpdate(**data), commit=True
    )


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


async def _seed_leg(pg_session, event, *, minutes_since_cp1):
    """Two checkpoints + a team that already arrived at the first one
    `minutes_since_cp1` minutes ago — the shared setup every leg-time test
    needs before arriving at the second checkpoint."""
    cp1 = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    cp2 = await _make_checkpoint(pg_session, order=2, lat=42.0, lon=-9.0, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)
    pg_session.add(
        CheckpointArrival(
            team_id=team.id,
            checkpoint_id=cp1.id,
            arrived_at=datetime.now(UTC) - timedelta(minutes=minutes_since_cp1),
        )
    )
    await pg_session.commit()
    return cp2, team


def _arrive_at_cp2(pg_client, team, cp2):
    with as_team(team.id, "TeamA"):
        return pg_client.post(
            f"/api/rally/v1/checkpoint/{cp2.id}/arrive",
            json={"latitude": 42.000045, "longitude": -9.0},
        )


async def _awards_for(pg_session, team_id):
    return (
        await pg_session.scalars(select(DynamicAward).where(DynamicAward.team_id == team_id))
    ).all()


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
    detail = resp.json()["detail"]
    assert "Too far" in detail
    # Coarse band only: the exact metre count must not leak, or a team could
    # trilaterate a post whose coordinates focused mode is hiding from them.
    assert "menos de 2km" in detail
    assert "500m" not in detail


async def test_arrive_rejected_when_gps_checkin_disabled(pg_session, pg_client):
    """Non-peddy events bootstrap with GPS check-in off, so the endpoint refuses
    the request — the same outcome the old hardcoded event-type gate produced."""
    await _make_event(pg_session, event_type=EventType.RALLY_TASCAS.value)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    team = await _make_team(pg_session)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
            json={"latitude": 41.0, "longitude": -8.0},
        )

    assert resp.status_code == 400
    assert "not enabled" in resp.json()["detail"]


async def test_arrive_allowed_for_non_peddy_event_when_setting_enabled(pg_session, pg_client):
    """GPS check-in is a setting, not a format: any event whose posts have
    coordinates can switch it on."""
    event = await _make_event(pg_session, event_type=EventType.GENERIC.value)
    await _set_settings(pg_session, gps_checkin_enabled=True)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )

    assert resp.status_code == 200, resp.text
    assert resp.json()["already_registered"] is False


async def test_arrive_rejected_before_the_event_window_opens(pg_session, pg_client):
    """An arrival is progress, so the event window gates it exactly as it gates
    a staff evaluation — and nothing is written to the arrivals table."""
    event = await _make_event(pg_session)
    # Timing lives on the event and is mirrored onto the settings row by
    # get_or_create's _sync_timing_from_event, so set it at the source.
    event.start_time = datetime.now(UTC) + timedelta(days=1)
    pg_session.add(event)
    await pg_session.commit()
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )

    assert resp.status_code == 400
    assert "not started" in resp.json()["detail"]

    arrivals = (
        await pg_session.scalars(
            select(CheckpointArrival).where(CheckpointArrival.team_id == team.id)
        )
    ).all()
    assert arrivals == []


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


async def test_arrive_no_activities_auto_completes_after_prior_advance(pg_session, pg_client):
    """Regression: post 1 (its only activity) is done and the staff-eval
    advance has inflated ``team.times`` with a pointer at post 2. The genuine
    GPS arrival at the no-activity post 2 must still auto-complete — the
    reachability guard counts resolved posts, not ``len(team.times)``.
    """
    from app.api.api_v1.staff_evaluation_utils import (
        advance_team_to_next_checkpoint,
        checkin_team_to_checkpoint,
    )
    from app.models.activity import ActivityResult

    await _make_event(pg_session)
    cp1 = await _make_checkpoint(pg_session, order=1)
    cp2 = await _make_checkpoint(pg_session, order=2)
    team = await _make_team(pg_session)

    act1 = Activity(
        name="Act1",
        checkpoint_id=cp1.id,
        activity_type="general",
        config={},
        is_active=True,
    )
    pg_session.add(act1)
    await pg_session.commit()
    pg_session.add(
        ActivityResult(activity_id=act1.id, team_id=team.id, final_score=10, is_completed=True)
    )
    await pg_session.commit()
    await checkin_team_to_checkpoint(pg_session, team.id, cp1.id)
    await advance_team_to_next_checkpoint(pg_session, team.id)
    await pg_session.commit()

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{cp2.id}/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )

    assert resp.status_code == 200, resp.text
    assert resp.json()["auto_completed"] is True


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
    from app import crud
    from app.api.api_v1.checkpoint_arrive import ArriveRequest, CheckpointArriveController
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
            service=CheckpointArrivalService(pg_session, crud.checkpoint, crud.team),
        )

    assert response.already_registered is True


async def test_arrive_rejects_checkpoint_from_another_event(pg_session, pg_client):
    """A team of one edition must not register progress against another
    edition's post, even with a valid team token and a perfect GPS fix."""
    current = await _make_event(pg_session)
    other = await _make_event(pg_session, name="Old Edition", is_current=False)
    foreign_checkpoint = await _make_checkpoint(pg_session, order=1, event_id=other.id)
    team = await _make_team(pg_session, event_id=current.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{foreign_checkpoint.id}/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )

    assert resp.status_code == 404, resp.text

    refreshed = await _reread_team(pg_session, team.id)
    assert len(refreshed.times) == 0


async def test_arrive_free_order_auto_completes_out_of_sequence(pg_session, pg_client):
    """With `checkpoint_order_matters=False` a team picks its own route, so a
    no-activity post must auto-complete even when earlier posts are unvisited.
    The strict-order guard used to silently block this and strand the team."""
    event = await _make_event(pg_session)
    await _set_settings(pg_session, checkpoint_order_matters=False)
    await _make_checkpoint(pg_session, order=1, event_id=event.id)
    checkpoint_3 = await _make_checkpoint(
        pg_session, order=3, lat=43.0, lon=-9.0, event_id=event.id
    )
    team = await _make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint_3.id}/arrive",
            json={"latitude": 43.000045, "longitude": -9.0},
        )

    assert resp.status_code == 200, resp.text
    assert resp.json()["auto_completed"] is True

    refreshed = await _reread_team(pg_session, team.id)
    assert len(refreshed.times) == 1


async def test_arrive_rejects_out_of_range_coordinates(pg_session, pg_client):
    """Latitude/longitude outside WGS-84 bounds are rejected by the schema
    rather than fed to Haversine, which would return a plausible distance."""
    event = await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
            json={"latitude": 91.0, "longitude": -8.0},
        )

    assert resp.status_code == 422


async def test_arrive_leg_time_bonus_applied_when_faster_than_target(pg_session, pg_client):
    """Second arrival, well inside the target: a bonus DynamicAward lands and
    the team's total reflects it."""
    event = await _make_event(pg_session)
    await _set_settings(
        pg_session,
        leg_time_scoring_enabled=True,
        leg_time_target_minutes=10,
        leg_time_points_per_minute=2,
        leg_time_max_adjustment=100,
    )
    cp2, team = await _seed_leg(pg_session, event, minutes_since_cp1=5)

    resp = _arrive_at_cp2(pg_client, team, cp2)

    assert resp.status_code == 200, resp.text
    awards = await _awards_for(pg_session, team.id)
    assert len(awards) == 1
    # team.total is round()'d; the leg took a hair under 5 minutes (real wall
    # clock between the two `commit()`s), so the award itself is a hair under
    # the exact 10-point bonus. Assert the shape, not exact float equality.
    assert 9 < awards[0].points <= 10  # arrived early -> bonus

    refreshed = await _reread_team(pg_session, team.id)
    assert refreshed.total == round(awards[0].points)


async def test_arrive_leg_time_penalty_applied_when_slower_than_target(pg_session, pg_client):
    event = await _make_event(pg_session)
    await _set_settings(
        pg_session,
        leg_time_scoring_enabled=True,
        leg_time_target_minutes=5,
        leg_time_points_per_minute=2,
        leg_time_max_adjustment=100,
    )
    cp2, team = await _seed_leg(pg_session, event, minutes_since_cp1=20)

    resp = _arrive_at_cp2(pg_client, team, cp2)

    assert resp.status_code == 200, resp.text
    awards = await _awards_for(pg_session, team.id)
    assert len(awards) == 1
    assert awards[0].points < 0  # arrived late -> penalty


async def test_arrive_leg_time_no_award_without_a_previous_arrival(pg_session, pg_client):
    """First checkpoint of the route: nothing to measure a leg against."""
    event = await _make_event(pg_session)
    await _set_settings(
        pg_session,
        leg_time_scoring_enabled=True,
        leg_time_points_per_minute=2,
        leg_time_max_adjustment=100,
    )
    checkpoint = await _make_checkpoint(pg_session, order=1, event_id=event.id)
    team = await _make_team(pg_session, event_id=event.id)

    with as_team(team.id, "TeamA"):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )

    assert resp.status_code == 200, resp.text
    assert await _awards_for(pg_session, team.id) == []


async def test_arrive_leg_time_no_award_when_feature_disabled(pg_session, pg_client):
    """Toggle off (the default): no DynamicAward regardless of timing."""
    event = await _make_event(pg_session)
    cp2, team = await _seed_leg(pg_session, event, minutes_since_cp1=5)

    resp = _arrive_at_cp2(pg_client, team, cp2)

    assert resp.status_code == 200, resp.text
    assert await _awards_for(pg_session, team.id) == []


async def test_arrive_leg_time_zero_rate_is_a_no_op(pg_session, pg_client):
    """Enabled but points_per_minute=0 (the settings default): still nothing
    to record, matching the "0 cost means free/off" convention."""
    event = await _make_event(pg_session)
    await _set_settings(pg_session, leg_time_scoring_enabled=True)
    cp2, team = await _seed_leg(pg_session, event, minutes_since_cp1=5)

    resp = _arrive_at_cp2(pg_client, team, cp2)

    assert resp.status_code == 200, resp.text
    assert await _awards_for(pg_session, team.id) == []


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
