"""Tests for the team photo upload endpoint (PUT /team/{id}/photo), against
real Postgres. `validate_and_store` (R2/S3 upload) stays mocked — external I/O.
"""

import io
from unittest.mock import AsyncMock, patch

from app.crud.crud_team import team as crud_team
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event as _make_event


def _png_upload() -> dict:
    return {"image": ("team.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 16), "image/png")}


async def _make_team(pg_session, name="T"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)


async def test_captain_can_upload_team_photo(pg_session, pg_client, as_user):
    await _make_event(pg_session)
    team = await _make_team(pg_session)
    as_user.team_id = team.id
    as_user.is_captain = True

    with (
        patch(
            "app.api.api_v1.team.validate_and_store",
            new=AsyncMock(return_value="https://r2/x.png"),
        ),
        patch("app.api.api_v1.team.storage_client.delete_image"),
    ):
        resp = pg_client.put(f"/api/rally/v1/team/{team.id}/photo", files=_png_upload())

    assert resp.status_code == 200, resp.text
    assert resp.json()["photo_url"] == "https://r2/x.png"


async def test_outsider_cannot_upload_team_photo(pg_session, pg_client, as_user):
    await _make_event(pg_session)
    team = await _make_team(pg_session)
    as_user.team_id = team.id + 1  # a different team than the one being uploaded to
    as_user.is_captain = False

    resp = pg_client.put(f"/api/rally/v1/team/{team.id}/photo", files=_png_upload())

    assert resp.status_code == 403
