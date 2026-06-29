"""Tests for checkpoint media endpoints (A1)."""
import io
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db, get_participant
from app.api.auth import api_nei_auth
from app.api.abac_deps import require_checkpoint_management_permission
from app.schemas.user import DetailedUser
from app.models.checkpoint_media import MediaKind


def _png_bytes() -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"0" * 16


def _admin_user() -> DetailedUser:
    return DetailedUser(id=1, name="Admin", disabled=False, team_id=None, is_captain=False, scopes=["admin"])


def _staff_user() -> DetailedUser:
    return DetailedUser(id=2, name="Staff", disabled=False, team_id=None, is_captain=False, scopes=["rally-staff"])


def _make_client(user: DetailedUser, allow_mgmt: bool = True) -> TestClient:
    app.dependency_overrides[get_db] = lambda: Mock()
    app.dependency_overrides[get_participant] = lambda: user
    app.dependency_overrides[api_nei_auth] = lambda: Mock(scopes=user.scopes)
    if allow_mgmt:
        app.dependency_overrides[require_checkpoint_management_permission] = lambda: None
    return TestClient(app)


def _media_obj(id=1, checkpoint_id=10, kind=MediaKind.photo, image_url=None, caption=None, order=0):
    m = Mock()
    m.id = id
    m.checkpoint_id = checkpoint_id
    m.kind = kind
    m.image_url = image_url
    m.caption = caption
    m.order = order
    return m


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_list_media_public():
    media = [_media_obj(id=1, kind=MediaKind.photo), _media_obj(id=2, kind=MediaKind.fun_fact, caption="Fun fact")]
    client = _make_client(_admin_user())
    with patch("app.api.api_v1.checkpoint_media.crud.checkpoint.get", new=AsyncMock(return_value=Mock(id=10))), \
         patch("app.crud.crud_checkpoint_media.CRUDCheckpointMedia.get_by_checkpoint", new=AsyncMock(return_value=media)):
        resp = client.get("/api/rally/v1/checkpoint/10/media")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["kind"] == "photo"
    assert data[1]["kind"] == "fun_fact"


def test_list_media_404_if_checkpoint_missing():
    client = _make_client(_admin_user())
    with patch("app.api.api_v1.checkpoint_media.crud.checkpoint.get", new=AsyncMock(return_value=None)):
        resp = client.get("/api/rally/v1/checkpoint/999/media")
    assert resp.status_code == 404


def test_create_media_fun_fact_no_image():
    created = _media_obj(id=5, kind=MediaKind.fun_fact, caption="Interesting fact", order=0)
    client = _make_client(_admin_user())
    with patch("app.api.api_v1.checkpoint_media.crud.checkpoint.get", new=AsyncMock(return_value=Mock(id=10))), \
         patch("app.crud.crud_checkpoint_media.CRUDCheckpointMedia.create", new=AsyncMock(return_value=created)):
        resp = client.post(
            "/api/rally/v1/checkpoint/10/media",
            data={"kind": "fun_fact", "caption": "Interesting fact", "order": "0"},
        )
    assert resp.status_code == 201
    assert resp.json()["kind"] == "fun_fact"
    assert resp.json()["caption"] == "Interesting fact"


def test_create_media_photo_with_image():
    created = _media_obj(id=6, kind=MediaKind.photo, image_url="https://r2/cp10/photo.png")
    client = _make_client(_admin_user())
    with patch("app.api.api_v1.checkpoint_media.crud.checkpoint.get", new=AsyncMock(return_value=Mock(id=10))), \
         patch("app.api.api_v1.checkpoint_media.validate_and_store", new=AsyncMock(return_value="https://r2/cp10/photo.png")), \
         patch("app.crud.crud_checkpoint_media.CRUDCheckpointMedia.create", new=AsyncMock(return_value=created)):
        resp = client.post(
            "/api/rally/v1/checkpoint/10/media",
            data={"kind": "photo", "order": "0"},
            files={"image": ("photo.png", io.BytesIO(_png_bytes()), "image/png")},
        )
    assert resp.status_code == 201
    assert resp.json()["image_url"] == "https://r2/cp10/photo.png"


def test_delete_media_admin():
    db_obj = _media_obj(id=3, image_url="https://r2/old.png")
    client = _make_client(_admin_user())
    with patch("app.crud.crud_checkpoint_media.CRUDCheckpointMedia.get", new=AsyncMock(return_value=db_obj)), \
         patch("app.crud.crud_checkpoint_media.CRUDCheckpointMedia.delete", new=AsyncMock(return_value=None)):
        resp = client.delete("/api/rally/v1/checkpoint/media/3")
    assert resp.status_code == 204


def test_delete_media_403_without_permission():
    app.dependency_overrides[get_db] = lambda: Mock()
    app.dependency_overrides[get_participant] = lambda: _staff_user()
    app.dependency_overrides[api_nei_auth] = lambda: Mock(scopes=["rally-staff"])
    # require_checkpoint_management_permission NOT overridden → raises 403
    resp = TestClient(app).delete("/api/rally/v1/checkpoint/media/3")
    assert resp.status_code == 403


def test_reorder_media():
    reordered = [_media_obj(id=2, order=0), _media_obj(id=1, order=1)]
    client = _make_client(_admin_user())
    with patch("app.api.api_v1.checkpoint_media.crud.checkpoint.get", new=AsyncMock(return_value=Mock(id=10))), \
         patch("app.crud.crud_checkpoint_media.CRUDCheckpointMedia.reorder", new=AsyncMock(return_value=reordered)):
        resp = client.post("/api/rally/v1/checkpoint/10/media/reorder", json=[2, 1])
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()]
    assert ids == [2, 1]
