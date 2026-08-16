"""Business rules for checkpoint media: the shared upload-if-provided
pattern used by both create and update, the visibility gate (staff/admin see
everything, a team sees only checkpoints it has reached, the public follow
the checkpoint-map rules), and the CRUD orchestration itself. Moved out of
app.api.api_v1.checkpoint_media, which used to hold this logic inline in the
router handlers.
"""

from typing import Any

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import is_admin_or_staff
from app.core.exceptions import RallyForbiddenError, RallyNotFoundError
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_checkpoint_media import CRUDCheckpointMedia
from app.crud.crud_rally_settings import rally_settings
from app.models.checkpoint_media import CheckpointMedia, MediaKind
from app.schemas.checkpoint_media import (
    CheckpointMediaCreate,
    CheckpointMediaResponse,
    CheckpointMediaUpdate,
)
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.checkpoint_service import CheckpointService
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store

MEDIA_NOT_FOUND = "Media not found"


class CheckpointMediaService:
    """Visibility gating and CRUD orchestration for checkpoint media."""

    def __init__(
        self,
        db: AsyncSession,
        checkpoint_crud: CRUDCheckPoint,
        media_crud: CRUDCheckpointMedia,
        checkpoint_service: CheckpointService,
    ) -> None:
        self._db = db
        self._checkpoint_crud = checkpoint_crud
        self._media_crud = media_crud
        self._checkpoint_service = checkpoint_service

    @staticmethod
    async def upload_image_if_provided(
        image: UploadFile | None, *, checkpoint_id: int
    ) -> str | None:
        """Store the image in R2 if one was actually attached.

        Returns None when no file was sent (multipart forms leave ``image``
        as an empty UploadFile rather than None, so ``image.filename`` is the
        real presence check).
        """
        if not image or not image.filename:
            return None
        return await validate_and_store(
            image=image,
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix=f"rally/checkpoints/{checkpoint_id}/media",
        )

    async def _checkpoint_or_404(self, checkpoint_id: int) -> Any:
        # CRUDBase.get() already raises RallyNotFoundError for a missing id
        # (mapped to 404 by the app's exception handler).
        return await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)

    async def _media_or_404(self, media_id: int) -> CheckpointMedia:
        db_obj = await self._media_crud.get(self._db, id=media_id)
        if not db_obj:
            raise RallyNotFoundError(MEDIA_NOT_FOUND)
        return db_obj

    async def list_visible_media(
        self,
        checkpoint_id: int,
        *,
        curr_user: DetailedUser | None,
        curr_team: TeamTokenData | None,
    ) -> list[CheckpointMediaResponse]:
        """Checkpoint media (photos, fun facts) — as strong a reveal as the
        checkpoint name/coordinates, so it's gated the same way: staff/admin
        see everything, a team sees only checkpoints it has reached, and the
        public follow the same rules as the checkpoint map.
        """
        await self._checkpoint_or_404(checkpoint_id)
        settings = await rally_settings.get_or_create(self._db)

        if curr_user and is_admin_or_staff(getattr(curr_user, "scopes", [])):
            allowed = True
        elif curr_user and curr_user.team_id:
            allowed = await self._checkpoint_service.team_can_view_media(
                curr_user.team_id, checkpoint_id, settings
            )
        elif curr_team:
            allowed = await self._checkpoint_service.team_can_view_media(
                curr_team.team_id, checkpoint_id, settings
            )
        else:
            allowed = await self._checkpoint_service.public_can_view_media(checkpoint_id, settings)

        if not allowed:
            raise RallyForbiddenError("Checkpoint not reached")

        items = await self._media_crud.get_by_checkpoint(self._db, checkpoint_id=checkpoint_id)
        return [CheckpointMediaResponse.model_validate(item) for item in items]

    async def create_media(
        self,
        checkpoint_id: int,
        *,
        kind: MediaKind,
        caption: str | None,
        order: int,
        title: str | None,
        content_url: str | None,
        content_text: str | None,
        image: UploadFile | None,
    ) -> CheckpointMediaResponse:
        await self._checkpoint_or_404(checkpoint_id)
        image_url = await self.upload_image_if_provided(image, checkpoint_id=checkpoint_id)
        obj_in = CheckpointMediaCreate(
            kind=kind,
            caption=caption,
            order=order,
            title=title,
            content_url=content_url or None,
            content_text=content_text,
        )
        created = await self._media_crud.create(
            self._db, checkpoint_id=checkpoint_id, obj_in=obj_in, image_url=image_url
        )
        return CheckpointMediaResponse.model_validate(created)

    async def update_media(
        self,
        media_id: int,
        *,
        caption: str | None,
        order: int | None,
        title: str | None,
        content_url: str | None,
        content_text: str | None,
        image: UploadFile | None,
    ) -> CheckpointMediaResponse:
        db_obj = await self._media_or_404(media_id)
        image_url = await self.upload_image_if_provided(image, checkpoint_id=db_obj.checkpoint_id)
        obj_in = CheckpointMediaUpdate(
            caption=caption,
            order=order,
            title=title,
            content_url=content_url or None,
            content_text=content_text,
        )
        updated = await self._media_crud.update(
            self._db, db_obj=db_obj, obj_in=obj_in, image_url=image_url
        )
        return CheckpointMediaResponse.model_validate(updated)

    async def delete_media(self, media_id: int) -> None:
        db_obj = await self._media_or_404(media_id)
        await self._media_crud.delete(self._db, db_obj=db_obj)

    async def reorder_media(
        self, checkpoint_id: int, ordered_ids: list[int]
    ) -> list[CheckpointMediaResponse]:
        await self._checkpoint_or_404(checkpoint_id)
        items = await self._media_crud.reorder(
            self._db, checkpoint_id=checkpoint_id, ordered_ids=ordered_ids
        )
        return [CheckpointMediaResponse.model_validate(item) for item in items]
