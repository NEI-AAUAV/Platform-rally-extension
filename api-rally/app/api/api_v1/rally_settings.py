from typing import Annotated

from fastapi import APIRouter, Depends, File, Security, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.user import DetailedUser
from app.schemas.rally_settings import RallySettingsUpdate, RallySettingsResponse

from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.api.abac_deps import validate_settings_update_access, validate_settings_view_access

from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_activity import rally_event
from app.services.storage import storage_client
from app.services.image_upload import (
    ALLOWED_FAVICON_CONTENT_TYPES,
    ALLOWED_PHOTO_CONTENT_TYPES,
    validate_and_store,
)

router = APIRouter()


async def _settings_response(
    db: AsyncSession, settings_row: object
) -> RallySettingsResponse:
    """Build the settings response, resolving the current event's type.

    ``event_type`` lives on the event, not the per-event settings row, so we
    fold it in here. Returns a new (immutable) response object.
    """
    event = await rally_event.ensure_current(db)
    response = RallySettingsResponse.model_validate(settings_row)
    return response.model_copy(update={"event_type": event.event_type})

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

    # Drop the previous R2 image for this field, if any.
    current = await rally_settings.get_or_create(db)
    storage_client.delete_image(getattr(current, field))

    url = await validate_and_store(
        image=image,
        allowed_content_types=allowed_content_types,
        key_prefix=f"rally/branding/{field}",
    )

    updated = await rally_settings.set_image_url(db, field=field, url=url)
    return await _settings_response(db, updated)

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
    # Resolve the current event's settings row (per-event, no more id=1 singleton).
    current = await rally_settings.get_or_create(db)
    updated = await rally_settings.update(db, id=current.id, obj_in=settings_in)
    return await _settings_response(db, updated)


@router.get("/rally/settings", status_code=200, response_model=RallySettingsResponse)
async def view_rally_settings(
    db: AsyncSession = Depends(get_db),
    curr_user: DetailedUser = Depends(get_participant),
    auth: AuthData = Security(api_nei_auth, scopes=[])
) -> RallySettingsResponse:
    """View rally settings"""
    validate_settings_view_access(curr_user, auth)
    settings = await rally_settings.get_or_create(db)
    return await _settings_response(db, settings)


@router.get("/rally/settings/public", status_code=200, response_model=RallySettingsResponse)
async def view_rally_settings_public(
    db: AsyncSession = Depends(get_db)
) -> RallySettingsResponse:
    """View rally settings (public access - no authentication required)"""
    settings = await rally_settings.get_or_create(db)
    return await _settings_response(db, settings)


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
