"""Tests for the clue-image upload endpoint (PUT /checkpoint/{id}/clue-image),
against real Postgres. `validate_and_store` (R2/S3 upload) stays mocked — it is
external I/O, out of scope here.
"""

import io
from unittest.mock import AsyncMock, patch

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.schemas.checkpoint import CheckPointCreate
from app.tests.conftest import make_event as _make_event

URL = "/api/rally/v1/checkpoint/{id}/clue-image"


def _png_upload() -> dict:
    return {"image": ("clue.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 16), "image/png")}


async def _make_checkpoint(pg_session, *, clue_media_url=None):
    return await crud_checkpoint.create(
        pg_session,
        obj_in=CheckPointCreate(
            name="Ponte de Ferro",
            order=1,
            clue="Onde o rio encontra a ponte de ferro.",
            clue_media_url=clue_media_url,
        ),
        commit=True,
    )


async def test_admin_uploads_a_clue_image(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    with (
        patch(
            "app.api.api_v1.checkpoint.validate_and_store",
            new=AsyncMock(return_value="https://r2/clue.png"),
        ),
        patch("app.api.api_v1.checkpoint.storage_client.delete_image"),
    ):
        resp = pg_client.put(URL.format(id=checkpoint.id), files=_png_upload())

    assert resp.status_code == 200, resp.text
    assert resp.json()["clue_media_url"] == "https://r2/clue.png"
    # The clue itself is untouched by an image upload.
    assert resp.json()["clue"] == "Onde o rio encontra a ponte de ferro."


async def test_replacing_an_image_deletes_the_previous_one(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session, clue_media_url="https://r2/old.png")

    with (
        patch(
            "app.api.api_v1.checkpoint.validate_and_store",
            new=AsyncMock(return_value="https://r2/new.png"),
        ),
        patch("app.api.api_v1.checkpoint.storage_client.delete_image") as delete_image,
    ):
        resp = pg_client.put(URL.format(id=checkpoint.id), files=_png_upload())

    assert resp.status_code == 200, resp.text
    # Otherwise every re-upload orphans a file in the bucket forever.
    delete_image.assert_called_once_with("https://r2/old.png")


async def test_upload_requires_an_admin(pg_session, pg_client):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    resp = pg_client.put(URL.format(id=checkpoint.id), files=_png_upload())

    assert resp.status_code in (401, 403), resp.text
