"""Tests for checkpoint media endpoints (A1), against real Postgres.

`validate_and_store` (R2/S3 upload) stays mocked — it's external I/O, out of
scope for this migration; everything else (DB, ABAC, routing) is real.
"""

import io
from unittest.mock import AsyncMock, patch

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_checkpoint_media import checkpoint_media as crud_media
from app.models.checkpoint_media import MediaKind
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.checkpoint_media import CheckpointMediaCreate
from app.tests.conftest import make_event as _make_event


def _png_bytes() -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"0" * 16


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order), commit=True
    )


async def test_list_media_public(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.photo, order=0),
    )
    await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.fun_fact, caption="Fun fact", order=1),
    )

    resp = pg_client.get(f"/api/rally/v1/checkpoint/{checkpoint.id}/media")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["kind"] == "photo"
    assert data[1]["kind"] == "fun_fact"


async def test_list_media_404_if_checkpoint_missing(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.get("/api/rally/v1/checkpoint/999999/media")

    assert resp.status_code == 404


async def test_create_media_fun_fact_no_image(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    resp = pg_client.post(
        f"/api/rally/v1/checkpoint/{checkpoint.id}/media",
        data={"kind": "fun_fact", "caption": "Interesting fact", "order": "0"},
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["kind"] == "fun_fact"
    assert resp.json()["caption"] == "Interesting fact"


async def test_create_media_photo_with_image(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    with patch(
        "app.services.checkpoint_media_service.validate_and_store",
        new=AsyncMock(return_value="https://r2/cp/photo.png"),
    ):
        resp = pg_client.post(
            f"/api/rally/v1/checkpoint/{checkpoint.id}/media",
            data={"kind": "photo", "order": "0"},
            files={"image": ("photo.png", io.BytesIO(_png_bytes()), "image/png")},
        )

    assert resp.status_code == 201, resp.text
    assert resp.json()["image_url"] == "https://r2/cp/photo.png"


async def test_delete_media_admin(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.photo, order=0),
    )

    resp = pg_client.delete(f"/api/rally/v1/checkpoint/media/{media.id}")

    assert resp.status_code == 204
    assert await crud_media.get(pg_session, id=media.id) is None


async def test_delete_media_403_without_permission(pg_session, pg_client, as_user):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.photo, order=0),
    )

    resp = pg_client.delete(f"/api/rally/v1/checkpoint/media/{media.id}")

    assert resp.status_code == 403


async def test_reorder_media(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    first = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.photo, order=0),
    )
    second = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.photo, order=1),
    )

    resp = pg_client.post(
        f"/api/rally/v1/checkpoint/{checkpoint.id}/media/reorder",
        json=[second.id, first.id],
    )

    assert resp.status_code == 200, resp.text
    ids = [item["id"] for item in resp.json()]
    assert ids == [second.id, first.id]


async def test_update_media_caption_no_image(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.photo, caption="Old", order=0),
    )

    resp = pg_client.put(
        f"/api/rally/v1/checkpoint/media/{media.id}",
        data={"caption": "New caption"},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["caption"] == "New caption"


async def test_update_media_with_new_image(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.photo, order=0),
        image_url="https://r2/cp/old.png",
    )

    with (
        patch(
            "app.services.checkpoint_media_service.validate_and_store",
            new=AsyncMock(return_value="https://r2/cp/new.png"),
        ),
        patch("app.crud.crud_checkpoint_media.storage_client.delete_image"),
    ):
        resp = pg_client.put(
            f"/api/rally/v1/checkpoint/media/{media.id}",
            files={"image": ("new.png", io.BytesIO(_png_bytes()), "image/png")},
        )

    assert resp.status_code == 200, resp.text
    assert resp.json()["image_url"] == "https://r2/cp/new.png"


async def test_update_media_404_if_missing(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.put(
        "/api/rally/v1/checkpoint/media/999999",
        data={"caption": "Nope"},
    )

    assert resp.status_code == 404


async def test_delete_media_404_if_missing(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.delete("/api/rally/v1/checkpoint/media/999999")

    assert resp.status_code == 404
