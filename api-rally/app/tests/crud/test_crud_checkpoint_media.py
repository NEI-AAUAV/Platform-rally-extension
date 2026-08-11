"""DB-backed tests for CRUDCheckpointMedia.update() (against real Postgres).

`storage_client.delete_image` is patched — real object storage deletion is
out of scope here; everything else (DB writes) is real.
"""

from unittest.mock import patch

import pytest

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_checkpoint_media import checkpoint_media as crud_media
from app.models.checkpoint_media import MediaKind
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.checkpoint_media import CheckpointMediaCreate, CheckpointMediaUpdate
from app.tests.conftest import make_event as _make_event


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order)
    )


async def _make_media(pg_session, checkpoint_id, **overrides):
    payload = {"kind": MediaKind.photo, "caption": "Original", "order": 0}
    payload.update(overrides)
    return await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint_id,
        obj_in=CheckpointMediaCreate(**payload),
        image_url="https://cdn.example.com/original.png",
    )


async def test_update_caption_only(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await _make_media(pg_session, checkpoint.id)

    updated = await crud_media.update(
        pg_session, db_obj=media, obj_in=CheckpointMediaUpdate(caption="New caption")
    )

    assert updated.caption == "New caption"
    assert updated.order == 0
    assert updated.image_url == "https://cdn.example.com/original.png"


async def test_update_order_only(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await _make_media(pg_session, checkpoint.id)

    updated = await crud_media.update(
        pg_session, db_obj=media, obj_in=CheckpointMediaUpdate(order=5)
    )

    assert updated.order == 5
    assert updated.caption == "Original"


async def test_update_image_url_deletes_old_image(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await _make_media(pg_session, checkpoint.id)

    with patch("app.crud.crud_checkpoint_media.storage_client.delete_image") as mock_delete:
        updated = await crud_media.update(
            pg_session,
            db_obj=media,
            obj_in=CheckpointMediaUpdate(),
            image_url="https://cdn.example.com/new.png",
        )

    mock_delete.assert_called_once_with("https://cdn.example.com/original.png")
    assert updated.image_url == "https://cdn.example.com/new.png"


async def test_update_image_url_when_no_previous_image_skips_delete(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.photo, caption="No image yet", order=0),
        image_url=None,
    )

    with patch("app.crud.crud_checkpoint_media.storage_client.delete_image") as mock_delete:
        updated = await crud_media.update(
            pg_session,
            db_obj=media,
            obj_in=CheckpointMediaUpdate(),
            image_url="https://cdn.example.com/first.png",
        )

    mock_delete.assert_not_called()
    assert updated.image_url == "https://cdn.example.com/first.png"


async def test_delete_removes_image_from_storage(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await _make_media(pg_session, checkpoint.id)

    with patch("app.crud.crud_checkpoint_media.storage_client.delete_image") as mock_delete:
        await crud_media.delete(pg_session, db_obj=media)

    mock_delete.assert_called_once_with("https://cdn.example.com/original.png")
    assert await crud_media.get(pg_session, id=media.id) is None


async def test_update_with_no_changes_leaves_fields_untouched(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await _make_media(pg_session, checkpoint.id)

    updated = await crud_media.update(pg_session, db_obj=media, obj_in=CheckpointMediaUpdate())

    assert updated.caption == "Original"
    assert updated.order == 0
    assert updated.image_url == "https://cdn.example.com/original.png"


async def test_create_qr_persists_content_text(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    media = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.qr, content_text="https://example.com/riddle"),
    )

    assert media.kind == MediaKind.qr
    assert media.content_text == "https://example.com/riddle"
    assert media.image_url is None
    assert media.content_url is None


async def test_create_spotify_persists_content_url_and_title(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    media = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(
            kind=MediaKind.spotify,
            content_url="https://open.spotify.com/track/abc123",
            title="Ouve isto",
        ),
    )

    assert media.content_url == "https://open.spotify.com/track/abc123"
    assert media.title == "Ouve isto"


async def test_create_link_persists_content_url(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    media = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.link, content_url="https://example.com"),
    )

    assert media.content_url == "https://example.com"


async def test_update_link_content_url_does_not_touch_image_storage(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.link, content_url="https://example.com/old"),
    )

    with patch("app.crud.crud_checkpoint_media.storage_client.delete_image") as mock_delete:
        updated = await crud_media.update(
            pg_session,
            db_obj=media,
            obj_in=CheckpointMediaUpdate(content_url="https://example.com/new"),
        )

    mock_delete.assert_not_called()
    assert updated.content_url == "https://example.com/new"


async def test_update_qr_rejects_field_from_a_different_kind(pg_session) -> None:
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    media = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.qr, content_text="original text"),
    )

    with pytest.raises(ValueError, match="content_url"):
        await crud_media.update(
            pg_session,
            db_obj=media,
            obj_in=CheckpointMediaUpdate(content_url="https://example.com"),
        )
