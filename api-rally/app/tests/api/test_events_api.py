"""API tests for the event (edition) endpoints.

Mock-based, matching the suite's style: the db dependency is overridden and
crud.rally_event is patched, so these exercise routing + response shaping
without a real schema.
"""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db
from app.models.activity import EventType


def _event(**over) -> SimpleNamespace:
    """A stand-in RallyEvent with every field RallyEventResponse needs."""
    base = dict(
        id=1,
        name="Rally Tascas",
        slug="rally-tascas",
        description="",
        event_type=EventType.RALLY_TASCAS.value,
        config={},
        is_active=True,
        is_current=True,
        start_time=None,
        end_time=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    base.update(over)
    return SimpleNamespace(**base)


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_events(client: TestClient) -> None:
    events = [_event(id=1, name="Rally A"), _event(id=2, name="Peddy B", event_type=EventType.PEDDY_PAPER.value)]
    with patch("app.crud.rally_event.get_multi", new=AsyncMock(return_value=events)):
        resp = client.get("/api/rally/v1/events")
    assert resp.status_code == 200
    body = resp.json()
    assert [e["name"] for e in body] == ["Rally A", "Peddy B"]
    assert body[1]["event_type"] == "peddy_paper"


def test_get_current_event(client: TestClient) -> None:
    with patch("app.crud.rally_event.ensure_current", new=AsyncMock(return_value=_event(name="Now"))):
        resp = client.get("/api/rally/v1/events/current")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Now"


def test_get_event_found(client: TestClient) -> None:
    with patch("app.crud.rally_event.get", new=AsyncMock(return_value=_event(id=5, name="Five"))):
        resp = client.get("/api/rally/v1/events/5")
    assert resp.status_code == 200
    assert resp.json()["id"] == 5


def test_get_event_not_found(client: TestClient) -> None:
    with patch("app.crud.rally_event.get", new=AsyncMock(return_value=None)):
        resp = client.get("/api/rally/v1/events/999")
    assert resp.status_code == 404
