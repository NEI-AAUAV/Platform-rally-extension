"""Tests for GPS geofence arrive endpoint (A2)."""
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db, get_current_team
from app.models.activity import EventType
from app.schemas.team_auth import TeamTokenData


def _team() -> TeamTokenData:
    return TeamTokenData(team_id=3, team_name="TeamA")


def _event(event_type: str = EventType.PEDDY_PAPER.value) -> Mock:
    e = Mock()
    e.event_type = event_type
    return e


def _checkpoint(lat=41.0, lon=-8.0, radius=50, order=1) -> Mock:
    cp = Mock()
    cp.id = 7
    cp.latitude = lat
    cp.longitude = lon
    cp.arrival_radius_m = radius
    cp.order = order
    return cp


def _activity(is_active=True) -> Mock:
    a = Mock()
    a.is_active = is_active
    return a


def _team_obj(times=None) -> Mock:
    t = Mock()
    t.times = times if times is not None else []
    return t


@pytest.fixture(autouse=True)
def clear():
    yield
    app.dependency_overrides.clear()


def _client() -> TestClient:
    app.dependency_overrides[get_db] = lambda: Mock()
    app.dependency_overrides[get_current_team] = lambda: _team()
    return TestClient(app)


def test_arrive_within_radius():
    db_mock = AsyncMock()
    db_mock.execute = AsyncMock(
        return_value=Mock(scalars=Mock(return_value=Mock(first=Mock(return_value=None))))
    )
    db_mock.add = Mock()
    db_mock.commit = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    app.dependency_overrides[get_current_team] = lambda: _team()

    with patch("app.api.api_v1.checkpoint_arrive.crud_activity.rally_event.get_current", new=AsyncMock(return_value=_event())), \
         patch("app.api.api_v1.checkpoint_arrive.crud.checkpoint.get", new=AsyncMock(return_value=_checkpoint())), \
         patch("app.api.api_v1.checkpoint_arrive.crud_activity.activity.get_by_checkpoint", new=AsyncMock(return_value=[_activity()])):
        resp = TestClient(app).post(
            "/api/rally/v1/checkpoint/7/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["already_registered"] is False
    assert data["team_id"] == 3
    assert data["checkpoint_id"] == 7
    assert data["distance_m"] < 10
    # Checkpoint has an activity → no auto-complete on arrival
    assert data["auto_completed"] is False


def test_arrive_too_far():
    client = _client()
    with patch("app.api.api_v1.checkpoint_arrive.crud_activity.rally_event.get_current", new=AsyncMock(return_value=_event())), \
         patch("app.api.api_v1.checkpoint_arrive.crud.checkpoint.get", new=AsyncMock(return_value=_checkpoint(radius=50))):
        resp = client.post(
            "/api/rally/v1/checkpoint/7/arrive",
            # 500m north
            json={"latitude": 41.0045, "longitude": -8.0},
        )
    assert resp.status_code == 400
    assert "Too far" in resp.json()["detail"]


def test_arrive_wrong_event_type():
    client = _client()
    with patch("app.api.api_v1.checkpoint_arrive.crud_activity.rally_event.get_current", new=AsyncMock(return_value=_event(EventType.RALLY_TASCAS.value))):
        resp = client.post("/api/rally/v1/checkpoint/7/arrive", json={"latitude": 41.0, "longitude": -8.0})
    assert resp.status_code == 400
    assert "Peddy Paper" in resp.json()["detail"]


def test_arrive_checkpoint_not_found():
    client = _client()
    with patch("app.api.api_v1.checkpoint_arrive.crud_activity.rally_event.get_current", new=AsyncMock(return_value=_event())), \
         patch("app.api.api_v1.checkpoint_arrive.crud.checkpoint.get", new=AsyncMock(return_value=None)):
        resp = client.post("/api/rally/v1/checkpoint/999/arrive", json={"latitude": 41.0, "longitude": -8.0})
    assert resp.status_code == 404


def test_arrive_no_activities_auto_completes():
    """Checkpoint with no activities: arrival marks it done and advances."""
    db_mock = AsyncMock()
    db_mock.execute = AsyncMock(
        return_value=Mock(scalars=Mock(return_value=Mock(first=Mock(return_value=None))))
    )
    db_mock.add = Mock()
    db_mock.commit = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    app.dependency_overrides[get_current_team] = lambda: _team()

    checkin_mock = AsyncMock()
    # Team is due to reach this order-1 checkpoint (0 visited so far).
    with patch("app.api.api_v1.checkpoint_arrive.crud_activity.rally_event.get_current", new=AsyncMock(return_value=_event())), \
         patch("app.api.api_v1.checkpoint_arrive.crud.checkpoint.get", new=AsyncMock(return_value=_checkpoint(order=1))), \
         patch("app.api.api_v1.checkpoint_arrive.crud_activity.activity.get_by_checkpoint", new=AsyncMock(return_value=[])), \
         patch("app.api.api_v1.checkpoint_arrive.crud.team.get", new=AsyncMock(return_value=_team_obj(times=[]))), \
         patch("app.api.api_v1.checkpoint_arrive.checkin_team_to_checkpoint", new=checkin_mock):
        resp = TestClient(app).post(
            "/api/rally/v1/checkpoint/7/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )
    assert resp.status_code == 200
    assert resp.json()["auto_completed"] is True
    checkin_mock.assert_awaited_once()


def test_arrive_no_activities_out_of_order_does_not_advance():
    """No-activity checkpoint but team is not yet due here: no auto-advance."""
    db_mock = AsyncMock()
    db_mock.execute = AsyncMock(
        return_value=Mock(scalars=Mock(return_value=Mock(first=Mock(return_value=None))))
    )
    db_mock.add = Mock()
    db_mock.commit = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    app.dependency_overrides[get_current_team] = lambda: _team()

    checkin_mock = AsyncMock()
    # Checkpoint order 3, but team has visited 0 → not their current post.
    with patch("app.api.api_v1.checkpoint_arrive.crud_activity.rally_event.get_current", new=AsyncMock(return_value=_event())), \
         patch("app.api.api_v1.checkpoint_arrive.crud.checkpoint.get", new=AsyncMock(return_value=_checkpoint(order=3))), \
         patch("app.api.api_v1.checkpoint_arrive.crud_activity.activity.get_by_checkpoint", new=AsyncMock(return_value=[])), \
         patch("app.api.api_v1.checkpoint_arrive.crud.team.get", new=AsyncMock(return_value=_team_obj(times=[]))), \
         patch("app.api.api_v1.checkpoint_arrive.checkin_team_to_checkpoint", new=checkin_mock):
        resp = TestClient(app).post(
            "/api/rally/v1/checkpoint/7/arrive",
            json={"latitude": 41.000045, "longitude": -8.0},
        )
    assert resp.status_code == 200
    assert resp.json()["auto_completed"] is False
    checkin_mock.assert_not_awaited()
