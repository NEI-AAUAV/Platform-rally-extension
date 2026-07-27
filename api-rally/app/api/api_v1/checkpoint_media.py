from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api import deps
from app.api.abac_deps import require_checkpoint_management_permission
from app.crud.crud_checkpoint_media import checkpoint_media as crud_media
from app.models.checkpoint_media import MediaKind
from app.schemas.checkpoint_media import (
    CheckpointMediaCreate,
    CheckpointMediaResponse,
    CheckpointMediaUpdate,
)
from app.services.checkpoint_media_service import CheckpointMediaService

CHECKPOINT_NOT_FOUND = "Checkpoint not found"
MEDIA_NOT_FOUND = "Media not found"

class CheckpointMediaController:
    """REST controller for checkpoint media (photos, fun facts)."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/checkpoint/{checkpoint_id}/media",
            self.list_checkpoint_media,
            methods=["GET"],
            name="list_checkpoint_media",
            responses={404: {"description": CHECKPOINT_NOT_FOUND}},
        )
        self.router.add_api_route(
            "/checkpoint/{checkpoint_id}/media",
            self.create_checkpoint_media,
            methods=["POST"],
            status_code=201,
            name="create_checkpoint_media",
            dependencies=[Depends(require_checkpoint_management_permission)],
            responses={404: {"description": CHECKPOINT_NOT_FOUND}},
        )
        self.router.add_api_route(
            "/checkpoint/media/{media_id}",
            self.update_checkpoint_media,
            methods=["PUT"],
            name="update_checkpoint_media",
            dependencies=[Depends(require_checkpoint_management_permission)],
            responses={404: {"description": MEDIA_NOT_FOUND}},
        )
        self.router.add_api_route(
            "/checkpoint/media/{media_id}",
            self.delete_checkpoint_media,
            methods=["DELETE"],
            status_code=204,
            name="delete_checkpoint_media",
            dependencies=[Depends(require_checkpoint_management_permission)],
            responses={404: {"description": MEDIA_NOT_FOUND}},
        )
        self.router.add_api_route(
            "/checkpoint/{checkpoint_id}/media/reorder",
            self.reorder_checkpoint_media,
            methods=["POST"],
            name="reorder_checkpoint_media",
            dependencies=[Depends(require_checkpoint_management_permission)],
            responses={404: {"description": CHECKPOINT_NOT_FOUND}},
        )

    async def _get_checkpoint_or_404(self, db: AsyncSession, checkpoint_id: int) -> Any:
        # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
        # (mapped to 404 by the app's exception handler) rather than returning
        # None, so the `if not cp` branch below is unreachable in practice; kept
        # as a defensive guard/type-contract in case `.get()`'s behavior changes.
        cp = await crud.checkpoint.get(db=db, id=checkpoint_id)
        if not cp:
            raise HTTPException(status_code=404, detail="Checkpoint not found")
        return cp

    async def list_checkpoint_media(
        self,
        checkpoint_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
    ) -> list[CheckpointMediaResponse]:
        await self._get_checkpoint_or_404(db, checkpoint_id)
        items = await crud_media.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
        return [CheckpointMediaResponse.model_validate(item) for item in items]

    async def create_checkpoint_media(
        self,
        checkpoint_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        kind: Annotated[MediaKind, Form()],
        caption: Annotated[str | None, Form()] = None,
        order: Annotated[int, Form()] = 0,
        image: Annotated[UploadFile | None, File()] = None,
    ) -> CheckpointMediaResponse:
        await self._get_checkpoint_or_404(db, checkpoint_id)
        image_url = await CheckpointMediaService.upload_image_if_provided(
            image, checkpoint_id=checkpoint_id
        )
        obj_in = CheckpointMediaCreate(kind=kind, caption=caption, order=order)
        created = await crud_media.create(
            db, checkpoint_id=checkpoint_id, obj_in=obj_in, image_url=image_url
        )
        return CheckpointMediaResponse.model_validate(created)

    async def update_checkpoint_media(
        self,
        media_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        caption: Annotated[str | None, Form()] = None,
        order: Annotated[int | None, Form()] = None,
        image: Annotated[UploadFile | None, File()] = None,
    ) -> CheckpointMediaResponse:
        db_obj = await crud_media.get(db, id=media_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail="Media not found")
        image_url = await CheckpointMediaService.upload_image_if_provided(
            image, checkpoint_id=db_obj.checkpoint_id
        )
        obj_in = CheckpointMediaUpdate(caption=caption, order=order)
        updated = await crud_media.update(db, db_obj=db_obj, obj_in=obj_in, image_url=image_url)
        return CheckpointMediaResponse.model_validate(updated)

    async def delete_checkpoint_media(
        self, media_id: int, db: Annotated[AsyncSession, Depends(deps.get_db)]
    ) -> None:
        db_obj = await crud_media.get(db, id=media_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail="Media not found")
        await crud_media.delete(db, db_obj=db_obj)

    async def reorder_checkpoint_media(
        self,
        checkpoint_id: int,
        ordered_ids: list[int],
        db: Annotated[AsyncSession, Depends(deps.get_db)],
    ) -> list[CheckpointMediaResponse]:
        await self._get_checkpoint_or_404(db, checkpoint_id)
        items = await crud_media.reorder(db, checkpoint_id=checkpoint_id, ordered_ids=ordered_ids)
        return [CheckpointMediaResponse.model_validate(item) for item in items]


router = CheckpointMediaController().router
