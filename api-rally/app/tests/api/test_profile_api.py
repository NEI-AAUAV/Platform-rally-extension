"""API tests for the profile / participation-history endpoints."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.auth import api_nei_auth
from app.api.deps import get_db, get_participant


def _auth() -> SimpleNamespace:
    return SimpleNamespace(oidc_sub="sub-1", name="Ana", email="ana@nei.pt", scopes=["rally-staff"])


def _participation(**over) -> SimpleNamespace:
    base = dict(
        event_id=5, team_id=10, team_name="Os Bons", team_total=42,
        team_classification=2, is_captain=True, joined_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    base.update(over)
    return SimpleNamespace(**base)


def _db_no_team() -> AsyncMock:
    """Session whose .get(Team, ...) is None so _entry uses the snapshot."""
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    return db


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = _db_no_team
    app.dependency_overrides[get_participant] = lambda: SimpleNamespace(
        id=1, name="Ana", disabled=False, staff_checkpoint_id=None, scopes=["rally-staff"]
    )
    app.dependency_overrides[api_nei_auth] = _auth
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_profile_me_lists_participations(client: TestClient) -> None:
    me = SimpleNamespace(id=1, name="Ana", email="ana@nei.pt", team_id=None, is_captain=False)
    event = SimpleNamespace(id=5, name="Rally 2026", event_type="rally_tascas")
    with patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=me)), \
         patch("app.crud.participation.get_for_sub", new=AsyncMock(return_value=[_participation()])), \
         patch("app.crud.rally_event.get", new=AsyncMock(return_value=event)):
        resp = client.get("/api/rally/v1/profile/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["authentik_sub"] == "sub-1"
    assert len(body["participations"]) == 1
    entry = body["participations"][0]
    assert entry["event_name"] == "Rally 2026"
    assert entry["team_name"] == "Os Bons"
    assert entry["team_classification"] == 2


def test_history_returns_entries(client: TestClient) -> None:
    event = SimpleNamespace(id=5, name="Rally 2026", event_type="rally_tascas")
    with patch("app.crud.participation.get_for_sub", new=AsyncMock(return_value=[_participation()])), \
         patch("app.crud.rally_event.get", new=AsyncMock(return_value=event)):
        resp = client.get("/api/rally/v1/profile/history")
    assert resp.status_code == 200
    assert resp.json()[0]["event_id"] == 5
