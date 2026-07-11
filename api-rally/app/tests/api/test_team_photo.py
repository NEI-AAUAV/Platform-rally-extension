"""Tests for the team photo upload endpoint (PUT /team/{id}/photo), against
real Postgres. `validate_and_store` (R2/S3 upload) stays mocked — external I/O.
"""
import io
from unittest.mock import AsyncMock, patch

from app.crud.crud_team import team as crud_team
from app.schemas.team import TeamCreate


def _png_upload() -> dict:
    return {"image": ("team.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 16), "image/png")}


async def _make_event(pg_session):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_team(pg_session, name="T"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


def _captain_override(app, team_id: int):
    from app.api import deps
    from app.api.auth import api_nei_auth, AuthData
    from app.schemas.user import DetailedUser

    user = DetailedUser(id=5, name="Cap", disabled=False, team_id=team_id, is_captain=True, scopes=[])
    app.dependency_overrides[deps.get_participant] = lambda: user
    app.dependency_overrides[api_nei_auth] = lambda: AuthData(oidc_sub="cap", name="Cap", scopes=[])


def _outsider_override(app):
    from app.api import deps
    from app.api.auth import api_nei_auth, AuthData
    from app.schemas.user import DetailedUser

    user = DetailedUser(id=6, name="Out", disabled=False, team_id=2, is_captain=False, scopes=[])
    app.dependency_overrides[deps.get_participant] = lambda: user
    app.dependency_overrides[api_nei_auth] = lambda: AuthData(oidc_sub="out", name="Out", scopes=[])


def _clear_overrides(app):
    from app.api import deps
    from app.api.auth import api_nei_auth

    app.dependency_overrides.pop(deps.get_participant, None)
    app.dependency_overrides.pop(api_nei_auth, None)


async def test_captain_can_upload_team_photo(pg_session, pg_client):
    from app.main import app

    await _make_event(pg_session)
    team = await _make_team(pg_session)
    _captain_override(app, team.id)
    try:
        with patch(
            "app.api.api_v1.team.validate_and_store",
            new=AsyncMock(return_value="https://r2/x.png"),
        ), patch("app.api.api_v1.team.storage_client.delete_image"):
            resp = pg_client.put(f"/api/rally/v1/team/{team.id}/photo", files=_png_upload())
    finally:
        _clear_overrides(app)

    assert resp.status_code == 200, resp.text
    assert resp.json()["photo_url"] == "https://r2/x.png"


async def test_outsider_cannot_upload_team_photo(pg_session, pg_client):
    from app.main import app

    await _make_event(pg_session)
    team = await _make_team(pg_session)
    _outsider_override(app)
    try:
        resp = pg_client.put(f"/api/rally/v1/team/{team.id}/photo", files=_png_upload())
    finally:
        _clear_overrides(app)

    assert resp.status_code == 403
