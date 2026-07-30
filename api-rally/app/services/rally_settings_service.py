"""Business rules for rally settings: response assembly (event-type resolution)
and branding image upload/replace.
"""

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.abac_deps import validate_settings_update_access
from app.api.auth import AuthData
from app.crud.crud_activity import rally_event
from app.crud.crud_rally_settings import rally_settings
from app.models.rally_settings import RallySettings
from app.schemas.rally_settings import RallySettingsResponse
from app.schemas.user import DetailedUser
from app.services.image_upload import validate_and_store
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
        return response.model_copy(update={"event_type": event.event_type})

    async def upload_branding_image(
        self,
        *,
        field: str,
        image: UploadFile,
        allowed_content_types: set[str],
        curr_user: DetailedUser,
        auth: AuthData,
    ) -> RallySettingsResponse:
        """Validate, store an image in R2, and persist its URL on the given column.

        Shared by the banner/logo/favicon endpoints (DRY). Replaces any
        previous R2 image for that field. Note: R2 assets are served from a
        separate public origin (R2_PUBLIC_BASE_URL), so an SVG favicon cannot
        reach app cookies/auth.
        """
        validate_settings_update_access(curr_user, auth)

        # Drop the previous R2 image for this field, if any.
        current = await rally_settings.get_or_create(self._db)
        storage_client.delete_image(getattr(current, field))

        url = await validate_and_store(
            image=image,
            allowed_content_types=allowed_content_types,
            key_prefix=f"rally/branding/{field}",
        )

        updated = await rally_settings.set_image_url(self._db, field=field, url=url)
        return await self.build_response(updated)
