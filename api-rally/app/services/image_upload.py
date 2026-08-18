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
# Regulation PDFs run bigger than branding images; a separate, higher cap.
MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024  # 15MB

JPEG_CONTENT_TYPE = "image/jpeg"
PNG_CONTENT_TYPE = "image/png"
PDF_CONTENT_TYPE = "application/pdf"

# Map an allowed content type to the file extension used in the R2 key.
EXT_BY_CONTENT_TYPE: dict[str, str] = {
    JPEG_CONTENT_TYPE: "jpg",
    PNG_CONTENT_TYPE: "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
    PDF_CONTENT_TYPE: "pdf",
}

# Raster photos (banners, logos, checkpoint media, team/badge images).
ALLOWED_PHOTO_CONTENT_TYPES = {JPEG_CONTENT_TYPE, PNG_CONTENT_TYPE, "image/webp", "image/gif"}
# Tab-icon formats (favicons).
ALLOWED_FAVICON_CONTENT_TYPES = {
    PNG_CONTENT_TYPE,
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
}
# Official regulation document.
ALLOWED_REGULATION_CONTENT_TYPES = {PDF_CONTENT_TYPE}


async def validate_and_store(
    *,
    image: UploadFile,
    allowed_content_types: set[str],
    key_prefix: str,
    max_size_bytes: int = MAX_IMAGE_SIZE_BYTES,
) -> str:
    """Validate an uploaded file and store it in R2, returning its public URL.

    Despite the name (kept for the many existing image callers), this also
    backs non-image uploads (e.g. the PDF regulation) via
    ``allowed_content_types``/``max_size_bytes``.

    Args:
        image: The multipart upload.
        allowed_content_types: Permitted MIME types for this upload.
        key_prefix: R2 key prefix, e.g. ``"rally/checkpoint_media"``. A random
            filename is appended so uploads never collide or overwrite.
        max_size_bytes: Size cap for this upload; defaults to the 5MB image cap.

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
        if read_bytes > max_size_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Max size is {max_size_bytes // (1024 * 1024)}MB",
            )
        chunks.append(chunk)
    data = b"".join(chunks)

    ext = EXT_BY_CONTENT_TYPE.get(image.content_type or "", "png")
    key = f"{key_prefix.rstrip('/')}/{uuid.uuid4().hex}.{ext}"
    url = storage_client.upload_image(key, data, image.content_type or JPEG_CONTENT_TYPE)
    if url is None:
        raise HTTPException(status_code=503, detail="Failed to upload image to storage.")
    return url
