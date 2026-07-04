"""Shared image-upload helper built on the R2 ``storage_client``.

Extracted from the branding upload endpoints so every feature that stores an
image (branding, checkpoint media, badge icons, deferred-judging photos, team
photos) validates and uploads the same way (DRY). Validation mirrors the
original branding rules: a content-type allowlist and a 5MB size cap.
"""
import uuid

from fastapi import HTTPException, UploadFile

from app.services.storage import storage_client

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB

# Map an allowed content type to the file extension used in the R2 key.
EXT_BY_CONTENT_TYPE: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
}

# Raster photos (banners, logos, checkpoint media, team/badge images).
ALLOWED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
# Tab-icon formats (favicons).
ALLOWED_FAVICON_CONTENT_TYPES = {
    "image/png",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
}


async def validate_and_store(
    *,
    image: UploadFile,
    allowed_content_types: set[str],
    key_prefix: str,
) -> str:
    """Validate an uploaded image and store it in R2, returning its public URL.

    Args:
        image: The multipart upload.
        allowed_content_types: Permitted MIME types for this upload.
        key_prefix: R2 key prefix, e.g. ``"rally/checkpoint_media"``. A random
            filename is appended so uploads never collide or overwrite.

    Raises:
        HTTPException 503: R2 is not configured, or the upload failed.
        HTTPException 400: Invalid content type or file too large.
    """
    if not storage_client.enabled:
        raise HTTPException(
            status_code=503,
            detail="Image upload is disabled: R2 storage is not configured.",
        )

    if image.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid file type '{image.content_type}'. "
                f"Allowed: {', '.join(sorted(allowed_content_types))}"
            ),
        )

    # Read in bounded chunks and stop as soon as the cap is exceeded, so an
    # oversized upload cannot balloon memory before the size check runs.
    chunks: list[bytes] = []
    read_bytes = 0
    while True:
        chunk = await image.read(1024 * 1024)
        if not chunk:
            break
        read_bytes += len(chunk)
        if read_bytes > MAX_IMAGE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Max size is {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB",
            )
        chunks.append(chunk)
    data = b"".join(chunks)

    ext = EXT_BY_CONTENT_TYPE.get(image.content_type or "", "png")
    key = f"{key_prefix.rstrip('/')}/{uuid.uuid4().hex}.{ext}"
    url = storage_client.upload_image(key, data, image.content_type or "image/jpeg")
    if url is None:
        raise HTTPException(status_code=503, detail="Failed to upload image to storage.")
    return url
