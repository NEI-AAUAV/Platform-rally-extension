"""Tests for checkpoint guide indication endpoints."""
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db, get_participant
from app.api.auth import api_nei_auth
from app.api.abac_deps import require_checkpoint_management_permission
from app.schemas.user import DetailedUser


def _admin_user() -> DetailedUser:
    return DetailedUser(id=1, name="Admin", disabled=False, team_id=None, is_captain=False, scopes=["admin"])


def _make_client(user: DetailedUser, allow_mgmt: bool = True) -> TestClient:
    app.dependency_overrides[get_db] = lambda: Mock()
    app.dependency_overrides[get_participant] = lambda: user
    app.dependency_overrides[api_nei_auth] = lambda: Mock(scopes=user.scopes)
    if allow_mgmt:
        app.dependency_overrides[require_checkpoint_management_permission] = lambda: None
    return TestClient(app)


def _indication_obj(id=1, checkpoint_id=10, hint="Say hi", question=None, expected_answer=None, order=0):
    m = Mock()
    m.id = id
    m.checkpoint_id = checkpoint_id
    m.hint = hint
    m.question = question
    m.expected_answer = expected_answer
    m.order = order
    return m


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_list_indications():
    items = [
        _indication_obj(id=1, hint="Give this hint"),
        _indication_obj(id=2, hint="Ask this", question="Capital?", expected_answer="Lisbon", order=1),
    ]
    client = _make_client(_admin_user())
    with patch("app.api.api_v1.checkpoint_guide_indication.crud.checkpoint.get", new=AsyncMock(return_value=Mock(id=10))), \
         patch("app.crud.crud_checkpoint_guide_indication.CRUDCheckpointGuideIndication.get_by_checkpoint", new=AsyncMock(return_value=items)):
        resp = client.get("/api/rally/v1/checkpoint/10/guide-indications")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[1]["question"] == "Capital?"
    assert data[1]["expected_answer"] == "Lisbon"


def test_list_indications_404_if_checkpoint_missing():
    client = _make_client(_admin_user())
    with patch("app.api.api_v1.checkpoint_guide_indication.crud.checkpoint.get", new=AsyncMock(return_value=None)):
        resp = client.get("/api/rally/v1/checkpoint/999/guide-indications")
    assert resp.status_code == 404


def test_create_indication():
    created = _indication_obj(id=5, hint="Tell them about the statue", question="Who?", expected_answer="Camoes")
    client = _make_client(_admin_user())
    with patch("app.api.api_v1.checkpoint_guide_indication.crud.checkpoint.get", new=AsyncMock(return_value=Mock(id=10))), \
         patch("app.crud.crud_checkpoint_guide_indication.CRUDCheckpointGuideIndication.create", new=AsyncMock(return_value=created)):
        resp = client.post(
            "/api/rally/v1/checkpoint/10/guide-indications",
            json={"hint": "Tell them about the statue", "question": "Who?", "expected_answer": "Camoes", "order": 0},
        )
    assert resp.status_code == 201
    assert resp.json()["hint"] == "Tell them about the statue"


def test_create_indication_requires_hint():
    client = _make_client(_admin_user())
    with patch("app.api.api_v1.checkpoint_guide_indication.crud.checkpoint.get", new=AsyncMock(return_value=Mock(id=10))):
        resp = client.post("/api/rally/v1/checkpoint/10/guide-indications", json={"question": "x"})
    assert resp.status_code == 422


def test_delete_indication_admin():
    db_obj = _indication_obj(id=3)
    client = _make_client(_admin_user())
    with patch("app.crud.crud_checkpoint_guide_indication.CRUDCheckpointGuideIndication.get", new=AsyncMock(return_value=db_obj)), \
         patch("app.crud.crud_checkpoint_guide_indication.CRUDCheckpointGuideIndication.delete", new=AsyncMock(return_value=None)):
        resp = client.delete("/api/rally/v1/checkpoint/guide-indications/3")
    assert resp.status_code == 204


def test_delete_indication_403_without_permission():
    app.dependency_overrides[get_db] = lambda: Mock()
    app.dependency_overrides[get_participant] = lambda: _admin_user()
    app.dependency_overrides[api_nei_auth] = lambda: Mock(scopes=["rally-guide"])
    # require_checkpoint_management_permission NOT overridden → raises 403
    resp = TestClient(app).delete("/api/rally/v1/checkpoint/guide-indications/3")
    assert resp.status_code == 403
