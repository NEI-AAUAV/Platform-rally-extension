"""Business rules for rally settings: response assembly (event-type resolution)
and branding image upload/replace.
"""

import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.abac_deps import validate_settings_update_access
from app.api.auth import AuthData
from app.core.config import settings as app_settings
from app.crud.crud_activity import rally_event
from app.crud.crud_rally_settings import rally_settings
from app.domain.event_configuration.resolver import resolve_capabilities
from app.models.rally_settings import RallySettings
from app.schemas.rally_settings import (
    MAX_PARTNER_LOGOS,
    MAX_PARTNER_NAME_LENGTH,
    RallySettingsResponse,
    normalize_partner_logos,
)
from app.schemas.user import DetailedUser
from app.services.image_upload import MAX_IMAGE_SIZE_BYTES, validate_and_store
from app.services.storage import storage_client


class RallySettingsService:
    """Settings response assembly and branding image lifecycle."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def build_response(self, settings_row: RallySettings) -> RallySettingsResponse:
        """Build the settings response, resolving the current event's type.

        ``event_type`` lives on the event, not the per-event settings row, so
        it is folded in here. Returns a new (immutable) response object.
        """
        event = await rally_event.ensure_current(self._db)
        response = RallySettingsResponse.model_validate(settings_row)
        capabilities = resolve_capabilities(
            event_type=event.event_type,
            profile=event.event_profile,
            settings=settings_row,
            platform_qr_supported=app_settings.SELF_CHECKIN_ENABLED,
            event_config=event.config,
            rotation_schedule=event.rotation_schedule,
        )
        effective = {name.value: capability.effective for name, capability in capabilities.items()}
        # Guide content has a live activation switch in addition to its feature flag.
        effective["guide_mode"] = bool(effective["guide_mode"] and settings_row.guide_mode_active)
        return response.model_copy(
            update={
                "event_type": event.event_type,
                "event_profile": event.event_profile,
                "effective_capabilities": effective,
            }
        )

    async def upload_branding_image(
        self,
        *,
        field: str,
        image: UploadFile,
        allowed_content_types: set[str],
        curr_user: DetailedUser,
        auth: AuthData,
        max_size_bytes: int = MAX_IMAGE_SIZE_BYTES,
    ) -> RallySettingsResponse:
        """Validate, store a file in R2, and persist its URL on the given column.

        Shared by the banner/logo/favicon/rules-PDF endpoints (DRY). Replaces
        any previous R2 file for that field. Note: R2 assets are served from a
        separate public origin (R2_PUBLIC_BASE_URL), so an SVG favicon cannot
        reach app cookies/auth.
        """
        validate_settings_update_access(curr_user, auth)

        current = await rally_settings.get_or_create(self._db)
        old_url = getattr(current, field)

        url = await validate_and_store(
            image=image,
            allowed_content_types=allowed_content_types,
            key_prefix=f"rally/branding/{field}",
            max_size_bytes=max_size_bytes,
        )

        try:
            updated = await rally_settings.set_image_url(self._db, field=field, url=url)
        except Exception:
            # The database remains on the old URL, so compensate the newly
            # uploaded object rather than orphaning it.
            storage_client.delete_image(url)
            raise
        # Cleanup is deliberately best-effort: the new URL is already durable.
        storage_client.delete_image(old_url)
        return await self.build_response(updated)

    async def add_partner_logo(
        self,
        *,
        name: str,
        image: UploadFile,
        allowed_content_types: set[str],
        curr_user: DetailedUser,
        auth: AuthData,
    ) -> RallySettingsResponse:
        """Upload one núcleo logo to R2 and append it to the strip (admin only)."""
        validate_settings_update_access(curr_user, auth)
        clean_name = name.strip()
        if not clean_name or len(clean_name) > MAX_PARTNER_NAME_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Name must be 1-{MAX_PARTNER_NAME_LENGTH} characters",
            )

        current = await rally_settings.get_or_create(self._db)
        logos = normalize_partner_logos(current.partner_logos)
        if len(logos) >= MAX_PARTNER_LOGOS:
            raise HTTPException(
                status_code=400, detail=f"At most {MAX_PARTNER_LOGOS} partner logos"
            )

        url = await validate_and_store(
            image=image,
            allowed_content_types=allowed_content_types,
            key_prefix="rally/branding/partners",
        )
        entry = {"id": uuid.uuid4().hex, "name": clean_name, "url": url}
        try:
            updated = await rally_settings.set_partner_logos(self._db, logos=[*logos, entry])
        except Exception:
            storage_client.delete_image(url)
            raise
        return await self.build_response(updated)

    async def remove_partner_logo(
        self, *, logo_id: str, curr_user: DetailedUser, auth: AuthData
    ) -> RallySettingsResponse:
        """Remove one núcleo logo from the strip and delete its R2 object."""
        validate_settings_update_access(curr_user, auth)
        current = await rally_settings.get_or_create(self._db)
        logos = normalize_partner_logos(current.partner_logos)
        removed = next((logo for logo in logos if logo["id"] == logo_id), None)
        if removed is None:
            raise HTTPException(status_code=404, detail="Partner logo not found")

        remaining = [logo for logo in logos if logo["id"] != logo_id]
        updated = await rally_settings.set_partner_logos(self._db, logos=remaining)
        storage_client.delete_image(removed["url"])
        if removed["dark_url"]:
            storage_client.delete_image(removed["dark_url"])
        return await self.build_response(updated)

    async def upload_partner_dark_logo(
        self,
        *,
        logo_id: str,
        image: UploadFile,
        allowed_content_types: set[str],
        curr_user: DetailedUser,
        auth: AuthData,
    ) -> RallySettingsResponse:
        """Upload/replace the white (dark-mode) version of one núcleo logo."""
        validate_settings_update_access(curr_user, auth)
        current = await rally_settings.get_or_create(self._db)
        logos = normalize_partner_logos(current.partner_logos)
        target = next((logo for logo in logos if logo["id"] == logo_id), None)
        if target is None:
            raise HTTPException(status_code=404, detail="Partner logo not found")

        url = await validate_and_store(
            image=image,
            allowed_content_types=allowed_content_types,
            key_prefix="rally/branding/partners",
        )
        next_logos = [
            {**logo, "dark_url": url} if logo["id"] == logo_id else logo for logo in logos
        ]
        try:
            updated = await rally_settings.set_partner_logos(self._db, logos=next_logos)
        except Exception:
            storage_client.delete_image(url)
            raise
        if target["dark_url"]:
            storage_client.delete_image(target["dark_url"])
        return await self.build_response(updated)

    async def reorder_partner_logos(
        self, *, ids: list[str], curr_user: DetailedUser, auth: AuthData
    ) -> RallySettingsResponse:
        """Reorder the strip. ``ids`` must be exactly the current set of ids."""
        validate_settings_update_access(curr_user, auth)
        current = await rally_settings.get_or_create(self._db)
        logos = normalize_partner_logos(current.partner_logos)
        by_id = {logo["id"]: logo for logo in logos}
        if len(ids) != len(by_id) or set(ids) != set(by_id):
            raise HTTPException(
                status_code=400, detail="ids must list every partner logo exactly once"
            )
        updated = await rally_settings.set_partner_logos(
            self._db, logos=[by_id[logo_id] for logo_id in ids]
        )
        return await self.build_response(updated)
