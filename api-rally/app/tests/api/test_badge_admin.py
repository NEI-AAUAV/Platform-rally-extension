"""Tests for badge catalogue admin endpoints (A3)."""
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db, get_admin
from app.api.api_v1.badge_admin import require_badges_enabled
from app.models.badge_definition import BadgeDefinition


def _defn(id: int = 1, code: str = "test_badge", active: bool = True) -> BadgeDefinition:
    d = BadgeDefinition(code=code, name="Test Badge", is_active=active, is_auto=False)
    d.id = id
    d.description = None
    d.icon_url = None
    return d


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client() -> TestClient:
    app.dependency_overrides[get_admin] = lambda: None
    # Badges feature on by default; the gate is exercised separately below.
    app.dependency_overrides[require_badges_enabled] = lambda: None
    return TestClient(app)


# ---------- kill-switch gate ----------

def test_write_endpoints_blocked_when_badges_disabled(admin_client: TestClient) -> None:
    from fastapi import HTTPException

    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock

    def _disabled() -> None:
        raise HTTPException(status_code=403, detail="Badges feature is disabled")

    app.dependency_overrides[require_badges_enabled] = _disabled

    # Every write refuses; the list endpoint stays reachable.
    assert admin_client.post(
        "/api/rally/v1/badge-definitions", json={"code": "x", "name": "X"}
    ).status_code == 403
    assert admin_client.put(
        "/api/rally/v1/badge-definitions/1", json={"name": "X"}
    ).status_code == 403
    assert admin_client.delete("/api/rally/v1/badge-definitions/1").status_code == 403
    assert admin_client.post(
        "/api/rally/v1/badges/award", json={"team_id": 1, "badge_code": "x"}
    ).status_code == 403
    assert admin_client.delete("/api/rally/v1/badges/5").status_code == 403


# ---------- list ----------

def test_list_badge_definitions(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    with patch("app.crud.crud_badge_definition.badge_definition.get_all", new=AsyncMock(return_value=[_defn()])):
        resp = admin_client.get("/api/rally/v1/badge-definitions")
    assert resp.status_code == 200
    assert resp.json()[0]["code"] == "test_badge"


# ---------- create ----------

def test_create_badge_definition(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    new_defn = _defn(id=2, code="new_badge")
    with patch("app.crud.crud_badge_definition.badge_definition.get_by_code", new=AsyncMock(return_value=None)), \
         patch("app.crud.crud_badge_definition.badge_definition.create", new=AsyncMock(return_value=new_defn)):
        resp = admin_client.post(
            "/api/rally/v1/badge-definitions",
            json={"code": "new_badge", "name": "New Badge"},
        )
    assert resp.status_code == 201
    assert resp.json()["code"] == "new_badge"


def test_create_badge_definition_with_full_fields(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    new_defn = _defn(id=3, code="fast_badge")
    new_defn.color = "#123456"
    new_defn.glyph = "⚡"
    new_defn.is_auto = True
    new_defn.trigger_type = "first_complete_activity"
    new_defn.criteria = {"activity_id": 7}
    created = AsyncMock(return_value=new_defn)
    with patch("app.crud.crud_badge_definition.badge_definition.get_by_code", new=AsyncMock(return_value=None)), \
         patch("app.crud.crud_badge_definition.badge_definition.create", new=created):
        resp = admin_client.post(
            "/api/rally/v1/badge-definitions",
            json={
                "code": "fast_badge",
                "name": "Fast",
                "color": "#123456",
                "glyph": "⚡",
                "is_auto": True,
                "trigger_type": "first_complete_activity",
                "criteria": {"activity_id": 7},
            },
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["color"] == "#123456"
    assert body["trigger_type"] == "first_complete_activity"
    assert body["criteria"] == {"activity_id": 7}


def test_create_badge_definition_rejects_bad_trigger(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    resp = admin_client.post(
        "/api/rally/v1/badge-definitions",
        json={"code": "x", "name": "X", "trigger_type": "not_a_trigger"},
    )
    assert resp.status_code == 422


def test_create_badge_definition_rejects_bad_code(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    resp = admin_client.post(
        "/api/rally/v1/badge-definitions",
        json={"code": "Bad Code!", "name": "X"},
    )
    assert resp.status_code == 422


def test_create_badge_definition_duplicate(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    with patch("app.crud.crud_badge_definition.badge_definition.get_by_code", new=AsyncMock(return_value=_defn())):
        resp = admin_client.post(
            "/api/rally/v1/badge-definitions",
            json={"code": "test_badge", "name": "Dup"},
        )
    assert resp.status_code == 409


# ---------- update ----------

def test_update_badge_definition(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    updated = _defn()
    updated.name = "Updated"
    with patch("app.crud.crud_badge_definition.badge_definition.get", new=AsyncMock(return_value=_defn())), \
         patch("app.crud.crud_badge_definition.badge_definition.update", new=AsyncMock(return_value=updated)):
        resp = admin_client.put("/api/rally/v1/badge-definitions/1", json={"name": "Updated"})
    assert resp.status_code == 200


def test_update_badge_definition_not_found(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    with patch("app.crud.crud_badge_definition.badge_definition.get", new=AsyncMock(return_value=None)):
        resp = admin_client.put("/api/rally/v1/badge-definitions/999", json={"name": "X"})
    assert resp.status_code == 404


# ---------- delete ----------

def test_delete_badge_definition(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    with patch("app.crud.crud_badge_definition.badge_definition.get", new=AsyncMock(return_value=_defn())), \
         patch("app.crud.crud_badge_definition.badge_definition.delete", new=AsyncMock(return_value=None)):
        resp = admin_client.delete("/api/rally/v1/badge-definitions/1")
    assert resp.status_code == 204


def test_delete_badge_definition_not_found(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    with patch("app.crud.crud_badge_definition.badge_definition.get", new=AsyncMock(return_value=None)):
        resp = admin_client.delete("/api/rally/v1/badge-definitions/999")
    assert resp.status_code == 404


# ---------- manual award / revoke ----------

def test_manual_award_badge(admin_client: TestClient) -> None:
    from datetime import datetime, timezone
    from app.models.badge import TeamBadge
    tb = TeamBadge(team_id=1, badge_type="test_badge", activity_id=None, checkpoint_id=None, meta={})
    tb.id = 10
    tb.awarded_at = datetime.now(timezone.utc)

    db_mock = AsyncMock()
    # idempotency check returns no existing badge
    db_mock.execute = AsyncMock(
        return_value=Mock(scalars=Mock(return_value=Mock(first=Mock(return_value=None))))
    )
    db_mock.add = Mock()
    db_mock.commit = AsyncMock()
    db_mock.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, "id", 10) or setattr(obj, "awarded_at", datetime.now(timezone.utc)))
    app.dependency_overrides[get_db] = lambda: db_mock

    with patch("app.crud.crud_badge_definition.badge_definition.get_by_code", new=AsyncMock(return_value=_defn())):
        resp = admin_client.post(
            "/api/rally/v1/badges/award",
            json={"team_id": 1, "badge_code": "test_badge"},
        )
    assert resp.status_code == 201


def test_manual_award_badge_inactive(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    with patch("app.crud.crud_badge_definition.badge_definition.get_by_code", new=AsyncMock(return_value=_defn(active=False))):
        resp = admin_client.post(
            "/api/rally/v1/badges/award",
            json={"team_id": 1, "badge_code": "test_badge"},
        )
    assert resp.status_code == 400


def test_revoke_badge(admin_client: TestClient) -> None:
    from datetime import datetime, timezone
    from app.models.badge import TeamBadge
    tb = TeamBadge(team_id=1, badge_type="test_badge", activity_id=None, checkpoint_id=None, meta={})
    tb.id = 5
    db_mock = AsyncMock()
    db_mock.execute = AsyncMock(
        return_value=Mock(scalars=Mock(return_value=Mock(first=Mock(return_value=tb))))
    )
    db_mock.delete = AsyncMock()
    db_mock.commit = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db_mock
    resp = admin_client.delete("/api/rally/v1/badges/5")
    assert resp.status_code == 204


def test_revoke_badge_not_found(admin_client: TestClient) -> None:
    db_mock = AsyncMock()
    db_mock.execute = AsyncMock(
        return_value=Mock(scalars=Mock(return_value=Mock(first=Mock(return_value=None))))
    )
    app.dependency_overrides[get_db] = lambda: db_mock
    resp = admin_client.delete("/api/rally/v1/badges/999")
    assert resp.status_code == 404
