from fastapi import APIRouter, Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.user import DetailedUser
from app.schemas.rally_settings import RallySettingsUpdate, RallySettingsResponse

from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.api.abac_deps import validate_settings_update_access, validate_settings_view_access

from app.crud.crud_rally_settings import rally_settings

router = APIRouter()

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
