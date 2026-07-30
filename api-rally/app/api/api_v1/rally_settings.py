from typing import Annotated

from fastapi import APIRouter, Depends, File, Security, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.abac_deps import validate_settings_update_access, validate_settings_view_access
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.crud.crud_rally_settings import rally_settings
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.user import DetailedUser
from app.services.audit_service import AuditActor, record_field_changes, snapshot_fields
from app.services.deps import get_rally_settings_service
from app.services.image_upload import ALLOWED_FAVICON_CONTENT_TYPES, ALLOWED_PHOTO_CONTENT_TYPES
from app.services.rally_settings_service import RallySettingsService

INVALID_FILE_ERROR = "Invalid file"
NOT_AUTHORIZED_ERROR = "Not authorized"
R2_UPLOAD_ERROR = "R2 storage not configured or upload failed"

# The highest-leverage change an admin can make (scoring weights, penalties,
# visibility toggles) — every mutable settings field except identity
# (id, event_id, which never change via this endpoint).
_SETTINGS_AUDITED_FIELDS = (
    "max_teams",
    "max_members_per_team",
    "enable_versus",
    "rally_start_time",
    "rally_end_time",
    "penalty_per_puke",
    "penalty_per_not_drinking",
    "bonus_per_extra_shot",
    "max_extra_shots_per_member",
    "checkpoint_order_matters",
    "enable_staff_scoring",
    "show_live_leaderboard",
    "show_team_details",
    "show_checkpoint_map",
    "participant_view_enabled",
    "show_route_mode",
    "show_score_mode",
    "rally_theme",
    "event_name",
    "event_subtitle",
    "accent_color",
    "banner_url",
    "logo_url",
    "favicon_url",
    "public_access_enabled",
    "allow_staff_registration",
    "allow_photo_as_team_photo",
    "guide_mode_enabled",
    "guide_mode_active",
    "badges_enabled",
    "home_layout",
    "ticker_items",
)


class RallySettingsController:
    """REST controller for /rally/settings."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/rally/settings",
            self.update_rally_settings,
            methods=["PUT"],
            status_code=200,
            name="update_rally_settings",
        )
        self.router.add_api_route(
            "/rally/settings",
            self.view_rally_settings,
            methods=["GET"],
            status_code=200,
            name="view_rally_settings",
        )
        self.router.add_api_route(
            "/rally/settings/public",
            self.view_rally_settings_public,
            methods=["GET"],
            status_code=200,
            name="view_rally_settings_public",
        )
        self.router.add_api_route(
            "/rally/settings/banner",
            self.upload_rally_banner,
            methods=["PUT"],
            status_code=200,
            name="upload_rally_banner",
            responses={
                400: {"description": INVALID_FILE_ERROR},
                403: {"description": NOT_AUTHORIZED_ERROR},
                503: {"description": R2_UPLOAD_ERROR},
            },
        )
        self.router.add_api_route(
            "/rally/settings/logo",
            self.upload_rally_logo,
            methods=["PUT"],
            status_code=200,
            name="upload_rally_logo",
            responses={
                400: {"description": INVALID_FILE_ERROR},
                403: {"description": NOT_AUTHORIZED_ERROR},
                503: {"description": R2_UPLOAD_ERROR},
            },
        )
        self.router.add_api_route(
            "/rally/settings/favicon",
            self.upload_rally_favicon,
            methods=["PUT"],
            status_code=200,
            name="upload_rally_favicon",
            responses={
                400: {"description": INVALID_FILE_ERROR},
                403: {"description": NOT_AUTHORIZED_ERROR},
                503: {"description": R2_UPLOAD_ERROR},
            },
        )

    async def update_rally_settings(
        self,
        settings_in: RallySettingsUpdate,
        db: Annotated[AsyncSession, Depends(get_db)],
        curr_user: Annotated[DetailedUser, Depends(get_participant)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[RallySettingsService, Depends(get_rally_settings_service)],
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
        before = snapshot_fields(current, _SETTINGS_AUDITED_FIELDS)
        updated = await rally_settings.update(db, id=current.id, obj_in=settings_in, commit=True)  # type: ignore[arg-type]
        await record_field_changes(
            db,
            before=before,
            after=updated,
            fields=_SETTINGS_AUDITED_FIELDS,
            action="rally_settings.updated",
            actor=AuditActor(id=str(curr_user.id), name=curr_user.name, kind="staff"),
            target_type="rally_settings",
            target_id=str(updated.id),
            event_id=updated.event_id,  # type: ignore[arg-type]
        )
        return await service.build_response(updated)

    async def view_rally_settings(
        self,
        db: Annotated[AsyncSession, Depends(get_db)],
        curr_user: Annotated[DetailedUser, Depends(get_participant)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[RallySettingsService, Depends(get_rally_settings_service)],
    ) -> RallySettingsResponse:
        """View rally settings"""
        validate_settings_view_access(curr_user, auth)
        settings = await rally_settings.get_or_create(db)
        return await service.build_response(settings)

    async def view_rally_settings_public(
        self,
        db: Annotated[AsyncSession, Depends(get_db)],
        service: Annotated[RallySettingsService, Depends(get_rally_settings_service)],
    ) -> RallySettingsResponse:
        """View rally settings (public access - no authentication required)"""
        settings = await rally_settings.get_or_create(db)
        return await service.build_response(settings)

    async def upload_rally_banner(
        self,
        image: Annotated[UploadFile, File(...)],
        curr_user: Annotated[DetailedUser, Depends(get_participant)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[RallySettingsService, Depends(get_rally_settings_service)],
    ) -> RallySettingsResponse:
        """Upload the event banner image to Cloudflare R2 (admin only)."""
        return await service.upload_branding_image(
            field="banner_url",
            image=image,
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            curr_user=curr_user,
            auth=auth,
        )

    async def upload_rally_logo(
        self,
        image: Annotated[UploadFile, File(...)],
        curr_user: Annotated[DetailedUser, Depends(get_participant)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[RallySettingsService, Depends(get_rally_settings_service)],
    ) -> RallySettingsResponse:
        """Upload the event logo image to Cloudflare R2 (admin only)."""
        return await service.upload_branding_image(
            field="logo_url",
            image=image,
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            curr_user=curr_user,
            auth=auth,
        )

    async def upload_rally_favicon(
        self,
        image: Annotated[UploadFile, File(...)],
        curr_user: Annotated[DetailedUser, Depends(get_participant)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[RallySettingsService, Depends(get_rally_settings_service)],
    ) -> RallySettingsResponse:
        """Upload the browser-tab favicon to Cloudflare R2 (admin only). Accepts png/ico/svg."""
        return await service.upload_branding_image(
            field="favicon_url",
            image=image,
            allowed_content_types=ALLOWED_FAVICON_CONTENT_TYPES,
            curr_user=curr_user,
            auth=auth,
        )


router = RallySettingsController().router
