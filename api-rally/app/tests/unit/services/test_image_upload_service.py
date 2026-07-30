"""Unit tests for the shared image upload/validation service."""

import asyncio
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException

from app.services import image_upload
from app.services.image_upload import (
    ALLOWED_PHOTO_CONTENT_TYPES,
    MAX_IMAGE_SIZE_BYTES,
    validate_and_store,
)

pytestmark = pytest.mark.asyncio


class _FakeUpload:
    """Minimal UploadFile stand-in with chunked async read."""

    def __init__(self, data: bytes, content_type: str):
        self._data = data
        self._pos = 0
        self.content_type = content_type

    async def read(self, size: int = -1) -> bytes:
        await asyncio.sleep(0)
        if size is None or size < 0:
            chunk, self._pos = self._data[self._pos :], len(self._data)
            return chunk
        chunk = self._data[self._pos : self._pos + size]
        self._pos += len(chunk)
        return chunk


def _storage(enabled=True, url="https://cdn.example/x.png"):
    st = Mock()
    st.enabled = enabled
    st.upload_image = Mock(return_value=url)
    return st


async def test_rejects_when_storage_disabled():
    with patch.object(image_upload, "storage_client", _storage(enabled=False)):
        call = validate_and_store(
            image=_FakeUpload(b"x", "image/png"),
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix="rally/test",
        )
        with pytest.raises(HTTPException) as exc:
            await call
    assert exc.value.status_code == 503


async def test_rejects_disallowed_content_type():
    with patch.object(image_upload, "storage_client", _storage()):
        call = validate_and_store(
            image=_FakeUpload(b"<svg/>", "image/svg+xml"),
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix="rally/test",
        )
        with pytest.raises(HTTPException) as exc:
            await call
    assert exc.value.status_code == 400
    assert "Invalid file type" in exc.value.detail


async def test_rejects_oversized_upload_without_buffering_it_all():
    """A payload over the cap must 400 — and stop reading at the cap, not
    buffer the entire body (DoS guard)."""
    big = _FakeUpload(b"a" * (MAX_IMAGE_SIZE_BYTES + 2), "image/png")
    with (
        patch.object(image_upload, "storage_client", _storage()),
        pytest.raises(HTTPException) as exc,
    ):
        await validate_and_store(
            image=big,
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix="rally/test",
        )
    assert exc.value.status_code == 400
    assert "too large" in exc.value.detail.lower()
    # Reading stopped at the first chunk past the cap.
    assert big._pos <= MAX_IMAGE_SIZE_BYTES + 1024 * 1024


async def test_happy_path_uploads_with_prefix_and_extension():
    storage = _storage()
    with patch.object(image_upload, "storage_client", storage):
        url = await validate_and_store(
            image=_FakeUpload(b"binary", "image/webp"),
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix="rally/checkpoint_media/",
        )
    assert url == "https://cdn.example/x.png"
    key, data, ctype = storage.upload_image.call_args.args
    assert key.startswith("rally/checkpoint_media/")
    assert key.endswith(".webp")
    assert "//" not in key.removeprefix("rally/checkpoint_media/")
    assert data == b"binary"
    assert ctype == "image/webp"


async def test_returns_503_when_upload_fails():
    storage = _storage(url=None)
    storage.upload_image = Mock(return_value=None)
    with patch.object(image_upload, "storage_client", storage):
        call = validate_and_store(
            image=_FakeUpload(b"x", "image/jpeg"),
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix="rally/test",
        )
        with pytest.raises(HTTPException) as exc:
            await call
    assert exc.value.status_code == 503
