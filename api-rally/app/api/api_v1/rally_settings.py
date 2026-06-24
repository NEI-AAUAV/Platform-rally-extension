import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Security, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.user import DetailedUser
from app.schemas.rally_settings import RallySettingsUpdate, RallySettingsResponse

from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.api.abac_deps import validate_settings_update_access, validate_settings_view_access

from app.crud.crud_rally_settings import rally_settings
from app.services.storage import storage_client

router = APIRouter()

# Branding image upload limits
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
_EXT_BY_CONTENT_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
}
# Banner/logo: raster photos. Favicon: also accepts .ico/.svg tab-icon formats.
ALLOWED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_FAVICON_CONTENT_TYPES = {
    "image/png",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
}


async def _upload_branding_image(
    *,
    field: str,
    image: UploadFile,
    allowed_content_types: set[str],
    db: AsyncSession,
    curr_user: DetailedUser,
    auth: AuthData,
) -> RallySettingsResponse:
    """Validate, store an image in R2, and persist its URL on the given column.

    Shared by the banner/logo/favicon endpoints (DRY). Replaces any previous
    R2 image for that field. Note: R2 assets are served from a separate public
    origin (R2_PUBLIC_BASE_URL), so an SVG favicon cannot reach app cookies/auth.
    """
    validate_settings_update_access(curr_user, auth)

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

    data = await image.read()
    if len(data) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size is {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB",
        )

    ext = _EXT_BY_CONTENT_TYPE.get(image.content_type or "", "png")

    # Drop the previous R2 image for this field, if any.
    current = await rally_settings.get_or_create(db)
    storage_client.delete_image(getattr(current, field))

    key = f"rally/branding/{field}_{uuid.uuid4().hex}.{ext}"
    url = storage_client.upload_image(key, data, image.content_type or "image/jpeg")
    if url is None:
        raise HTTPException(status_code=503, detail="Failed to upload image to storage.")

    updated = await rally_settings.set_image_url(db, field=field, url=url)
    return RallySettingsResponse.model_validate(updated)

@router.put("/rally/settings", status_code=200, response_model=RallySettingsResponse)
async def update_rally_settings(
    settings_in: RallySettingsUpdate,
    db: AsyncSession = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[])
) -> RallySettingsResponse:
    """
    Update global rally configuration (admin only).
    Args:
        settings_in: New settings values

    Returns:
        Updated rally settings

    Raises:
        403: If user is not authorized
        400: If validation fails
    """
    validate_settings_update_access(curr_user, auth)
    updated = await rally_settings.update(db, id=1, obj_in=settings_in)
    return RallySettingsResponse.model_validate(updated)


@router.get("/rally/settings", status_code=200, response_model=RallySettingsResponse)
async def view_rally_settings(
    db: AsyncSession = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[])
) -> RallySettingsResponse:
    """View rally settings"""
    validate_settings_view_access(curr_user, auth)
    settings = await rally_settings.get_or_create(db)
    return RallySettingsResponse.model_validate(settings)


@router.get("/rally/settings/public", status_code=200, response_model=RallySettingsResponse)
async def view_rally_settings_public(
    db: AsyncSession = Depends(get_db)
) -> RallySettingsResponse:
    """View rally settings (public access - no authentication required)"""
    settings = await rally_settings.get_or_create(db)
    return RallySettingsResponse.model_validate(settings)


@router.put(
    "/rally/settings/banner",
    status_code=200,
    response_model=RallySettingsResponse,
    responses={
        400: {"description": "Invalid file"},
        403: {"description": "Not authorized"},
        503: {"description": "R2 storage not configured or upload failed"},
    },
)
async def upload_rally_banner(
    image: Annotated[UploadFile, File(...)],
    db: AsyncSession = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
) -> RallySettingsResponse:
    """Upload the event banner image to Cloudflare R2 (admin only)."""
    return await _upload_branding_image(
        field="banner_url",
        image=image,
        allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
        db=db,
        curr_user=curr_user,
        auth=auth,
    )


@router.put(
    "/rally/settings/logo",
    status_code=200,
    response_model=RallySettingsResponse,
    responses={
        400: {"description": "Invalid file"},
        403: {"description": "Not authorized"},
        503: {"description": "R2 storage not configured or upload failed"},
    },
)
async def upload_rally_logo(
    image: Annotated[UploadFile, File(...)],
    db: AsyncSession = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
) -> RallySettingsResponse:
    """Upload the event logo image to Cloudflare R2 (admin only)."""
    return await _upload_branding_image(
        field="logo_url",
        image=image,
        allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
        db=db,
        curr_user=curr_user,
        auth=auth,
    )


@router.put(
    "/rally/settings/favicon",
    status_code=200,
    response_model=RallySettingsResponse,
    responses={
        400: {"description": "Invalid file"},
        403: {"description": "Not authorized"},
        503: {"description": "R2 storage not configured or upload failed"},
    },
)
async def upload_rally_favicon(
    image: Annotated[UploadFile, File(...)],
    db: AsyncSession = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
) -> RallySettingsResponse:
    """Upload the browser-tab favicon to Cloudflare R2 (admin only). Accepts png/ico/svg."""
    return await _upload_branding_image(
        field="favicon_url",
        image=image,
        allowed_content_types=ALLOWED_FAVICON_CONTENT_TYPES,
        db=db,
        curr_user=curr_user,
        auth=auth,
    )
