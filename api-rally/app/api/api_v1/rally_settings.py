from typing import Annotated

from fastapi import APIRouter, Depends, File, Security, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.abac_deps import validate_settings_update_access, validate_settings_view_access
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.crud.crud_rally_settings import rally_settings
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.user import DetailedUser
from app.services.image_upload import ALLOWED_FAVICON_CONTENT_TYPES, ALLOWED_PHOTO_CONTENT_TYPES
from app.services.rally_settings_service import RallySettingsService

router = APIRouter()


@router.put("/rally/settings", status_code=200)
async def update_rally_settings(
    settings_in: RallySettingsUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
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
    updated = await rally_settings.update(db, id=current.id, obj_in=settings_in)  # type: ignore[arg-type]
    return await RallySettingsService(db).build_response(updated)


@router.get("/rally/settings", status_code=200)
async def view_rally_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RallySettingsResponse:
    """View rally settings"""
    validate_settings_view_access(curr_user, auth)
    settings = await rally_settings.get_or_create(db)
    return await RallySettingsService(db).build_response(settings)


@router.get("/rally/settings/public", status_code=200)
async def view_rally_settings_public(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RallySettingsResponse:
    """View rally settings (public access - no authentication required)"""
    settings = await rally_settings.get_or_create(db)
    return await RallySettingsService(db).build_response(settings)


@router.put(
    "/rally/settings/banner",
    status_code=200,
    responses={
        400: {"description": "Invalid file"},
        403: {"description": "Not authorized"},
        503: {"description": "R2 storage not configured or upload failed"},
    },
)
async def upload_rally_banner(
    image: Annotated[UploadFile, File(...)],
    db: Annotated[AsyncSession, Depends(get_db)],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RallySettingsResponse:
    """Upload the event banner image to Cloudflare R2 (admin only)."""
    return await RallySettingsService(db).upload_branding_image(
        field="banner_url",
        image=image,
        allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
        curr_user=curr_user,
        auth=auth,
    )


@router.put(
    "/rally/settings/logo",
    status_code=200,
    responses={
        400: {"description": "Invalid file"},
        403: {"description": "Not authorized"},
        503: {"description": "R2 storage not configured or upload failed"},
    },
)
async def upload_rally_logo(
    image: Annotated[UploadFile, File(...)],
    db: Annotated[AsyncSession, Depends(get_db)],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RallySettingsResponse:
    """Upload the event logo image to Cloudflare R2 (admin only)."""
    return await RallySettingsService(db).upload_branding_image(
        field="logo_url",
        image=image,
        allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
        curr_user=curr_user,
        auth=auth,
    )


@router.put(
    "/rally/settings/favicon",
    status_code=200,
    responses={
        400: {"description": "Invalid file"},
        403: {"description": "Not authorized"},
        503: {"description": "R2 storage not configured or upload failed"},
    },
)
async def upload_rally_favicon(
    image: Annotated[UploadFile, File(...)],
    db: Annotated[AsyncSession, Depends(get_db)],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RallySettingsResponse:
    """Upload the browser-tab favicon to Cloudflare R2 (admin only). Accepts png/ico/svg."""
    return await RallySettingsService(db).upload_branding_image(
        field="favicon_url",
        image=image,
        allowed_content_types=ALLOWED_FAVICON_CONTENT_TYPES,
        curr_user=curr_user,
        auth=auth,
    )
