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


def _checkpoint(lat=41.0, lon=-8.0, radius=50) -> Mock:
    cp = Mock()
    cp.id = 7
    cp.latitude = lat
    cp.longitude = lon
    cp.arrival_radius_m = radius
    return cp


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
         patch("app.api.api_v1.checkpoint_arrive.crud.checkpoint.get", new=AsyncMock(return_value=_checkpoint())):
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
