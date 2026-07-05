"""Tests for dynamic scoring endpoints (D4)."""
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db, get_admin
from app.models.dynamic_scoring import DynamicRule, DynamicAward


def _rule(id: int = 1, name: str = "Bonus Rule", points: float = 50.0) -> DynamicRule:
    r = DynamicRule(name=name, rule_type="bonus", points=points, is_active=True, is_automatic=False)
    r.id = id
    r.event_id = None
    r.description = None
    return r


def _award(id: int = 1, team_id: int = 5, points: float = 25.0) -> DynamicAward:
    a = DynamicAward(team_id=team_id, points=points, reason="nice", is_active=True)
    a.id = id
    a.event_id = None
    a.rule_id = None
    return a


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client() -> TestClient:
    app.dependency_overrides[get_admin] = lambda: None
    return TestClient(app)


# ---------- DynamicRule ----------

def test_list_rules_empty(admin_client: TestClient) -> None:
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=Mock(all=Mock(return_value=[])))
    app.dependency_overrides[get_db] = lambda: db
    with patch("app.api.api_v1.dynamic_scoring.rally_event.get_current", new=AsyncMock(return_value=None)):
        resp = admin_client.get("/api/rally/v1/dynamic-rules")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_rule(admin_client: TestClient) -> None:
    db = AsyncMock()
    db.add = Mock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, "id", 1) or setattr(obj, "event_id", None))
    app.dependency_overrides[get_db] = lambda: db
    with patch("app.api.api_v1.dynamic_scoring.rally_event.get_current", new=AsyncMock(return_value=None)):
        resp = admin_client.post(
            "/api/rally/v1/dynamic-rules",
            json={"name": "First Arrival", "points": 100.0, "rule_type": "bonus"},
        )
    assert resp.status_code == 201
    assert resp.json()["name"] == "First Arrival"


def test_update_rule(admin_client: TestClient) -> None:
    rule = _rule()
    db = AsyncMock()
    db.get = AsyncMock(return_value=rule)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db
    resp = admin_client.put("/api/rally/v1/dynamic-rules/1", json={"points": 75.0})
    assert resp.status_code == 200
    assert rule.points == pytest.approx(75.0)


def test_update_rule_not_found(admin_client: TestClient) -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    app.dependency_overrides[get_db] = lambda: db
    resp = admin_client.put("/api/rally/v1/dynamic-rules/999", json={"points": 10.0})
    assert resp.status_code == 404


def test_delete_rule(admin_client: TestClient) -> None:
    rule = _rule()
    db = AsyncMock()
    db.get = AsyncMock(return_value=rule)
    db.delete = AsyncMock()
    db.commit = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db
    resp = admin_client.delete("/api/rally/v1/dynamic-rules/1")
    assert resp.status_code == 204


def test_delete_rule_not_found(admin_client: TestClient) -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    app.dependency_overrides[get_db] = lambda: db
    resp = admin_client.delete("/api/rally/v1/dynamic-rules/999")
    assert resp.status_code == 404


# ---------- DynamicAward ----------

def test_list_awards(admin_client: TestClient) -> None:
    award = _award()
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=Mock(all=Mock(return_value=[award])))
    app.dependency_overrides[get_db] = lambda: db
    resp = admin_client.get("/api/rally/v1/dynamic-awards")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["team_id"] == 5


def test_create_award(admin_client: TestClient) -> None:
    db = AsyncMock()
    db.add = Mock()
    db.commit = AsyncMock()
    award = _award()
    db.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, "id", award.id) or setattr(obj, "event_id", None) or setattr(obj, "rule_id", None))
    app.dependency_overrides[get_db] = lambda: db
    with patch("app.api.api_v1.dynamic_scoring.rally_event.get_current", new=AsyncMock(return_value=None)), \
         patch("app.api.api_v1.dynamic_scoring.ScoringService") as ss:
        ss.return_value.update_team_scores = AsyncMock()
        resp = admin_client.post(
            "/api/rally/v1/dynamic-awards",
            json={"team_id": 5, "points": 25.0, "reason": "creativity"},
        )
    assert resp.status_code == 201
    assert resp.json()["points"] == pytest.approx(25.0)


def test_delete_award(admin_client: TestClient) -> None:
    award = _award()
    db = AsyncMock()
    db.get = AsyncMock(return_value=award)
    db.commit = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db
    with patch("app.api.api_v1.dynamic_scoring.ScoringService") as ss:
        ss.return_value.update_team_scores = AsyncMock()
        resp = admin_client.delete("/api/rally/v1/dynamic-awards/1")
    assert resp.status_code == 204
    assert award.is_active is False


def test_delete_award_not_found(admin_client: TestClient) -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    app.dependency_overrides[get_db] = lambda: db
    resp = admin_client.delete("/api/rally/v1/dynamic-awards/999")
    assert resp.status_code == 404
