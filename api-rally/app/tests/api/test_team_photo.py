"""Tests for the team photo upload endpoint (PUT /team/{id}/photo)."""
import io
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db, get_participant
from app.api.auth import api_nei_auth
from app.schemas.user import DetailedUser


def _png_upload() -> dict:
    return {"image": ("team.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 16), "image/png")}


@pytest.fixture
def captain_user() -> DetailedUser:
    return DetailedUser(id=5, name="Cap", disabled=False, team_id=1, is_captain=True, scopes=[])


@pytest.fixture
def outsider_user() -> DetailedUser:
    return DetailedUser(id=6, name="Out", disabled=False, team_id=2, is_captain=False, scopes=[])


@pytest.fixture
def client_for(captain_user):
    """Build a TestClient with auth/db overridden to a given user."""
    def _make(user: DetailedUser) -> TestClient:
        app.dependency_overrides[get_db] = lambda: Mock()
        app.dependency_overrides[get_participant] = lambda: user
        app.dependency_overrides[api_nei_auth] = lambda: Mock(scopes=user.scopes)
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


def test_captain_can_upload_team_photo(client_for, captain_user):
    team = Mock(id=1, name="T", total=0, classification=-1, versus_group_id=None,
                photo_url="", times=[], score_per_checkpoint=[], members=[])
    with patch("app.api.api_v1.team.validate_and_store", new=AsyncMock(return_value="https://r2/x.png")), \
         patch("app.api.api_v1.team.storage_client.delete_image"), \
         patch("app.crud.crud_team.team.get", new=AsyncMock(return_value=team)), \
         patch("app.crud.crud_team.team.set_photo_url", new=AsyncMock(return_value=team)), \
         patch("app.api.api_v1.team._detailed_team", new=AsyncMock(return_value={
             "id": 1, "name": "T", "total": 0, "classification": -1,
             "versus_group_id": None, "photo_url": "https://r2/x.png",
             "access_code": "AAAA-BBBB", "times": [], "score_per_checkpoint": [],
             "members": [],
         })):
        client = client_for(captain_user)
        resp = client.put("/api/rally/v1/team/1/photo", files=_png_upload())
    assert resp.status_code == 200, resp.text
    assert resp.json()["photo_url"] == "https://r2/x.png"


def test_outsider_cannot_upload_team_photo(client_for, outsider_user):
    # Outsider: not captain of team 1, and check_permission denies UPDATE_TEAM.
    with patch("app.api.api_v1.team.check_permission", return_value=False):
        client = client_for(outsider_user)
        resp = client.put("/api/rally/v1/team/1/photo", files=_png_upload())
    assert resp.status_code == 403
