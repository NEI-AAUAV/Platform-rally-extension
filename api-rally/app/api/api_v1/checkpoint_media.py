from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.abac_deps import require_checkpoint_management_permission
from app.models.checkpoint_media import MediaKind
from app.schemas.checkpoint_media import CheckpointMediaResponse
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.audit_service import AuditActor, record_audit
from app.services.checkpoint_media_service import CheckpointMediaService
from app.services.deps import get_checkpoint_media_service

CHECKPOINT_NOT_FOUND = "Checkpoint not found"
MEDIA_NOT_FOUND = "Media not found"


def _actor(curr_user: DetailedUser) -> AuditActor:
    return AuditActor(id=str(curr_user.id), name=curr_user.name, kind="user")


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

    async def list_checkpoint_media(
        self,
        checkpoint_id: int,
        curr_user: Annotated[DetailedUser | None, Depends(deps.get_current_user_optional)],
        curr_team: Annotated[TeamTokenData | None, Depends(deps.get_current_team_optional)],
        service: Annotated[CheckpointMediaService, Depends(get_checkpoint_media_service)],
    ) -> list[CheckpointMediaResponse]:
        return await service.list_visible_media(
            checkpoint_id, curr_user=curr_user, curr_team=curr_team
        )

    async def create_checkpoint_media(
        self,
        checkpoint_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[CheckpointMediaService, Depends(get_checkpoint_media_service)],
        kind: Annotated[MediaKind, Form()],
        caption: Annotated[str | None, Form()] = None,
        order: Annotated[int, Form()] = 0,
        title: Annotated[str | None, Form()] = None,
        content_url: Annotated[str | None, Form()] = None,
        content_text: Annotated[str | None, Form()] = None,
        image: Annotated[UploadFile | None, File()] = None,
    ) -> CheckpointMediaResponse:
        try:
            created = await service.create_media(
                checkpoint_id,
                kind=kind,
                caption=caption,
                order=order,
                title=title,
                content_url=content_url,
                content_text=content_text,
                image=image,
            )
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        await record_audit(
            db,
            action="checkpoint.media_created",
            actor=_actor(curr_user),
            target_type="checkpoint_media",
            target_id=str(created.id),
            note=f"checkpoint_id={checkpoint_id} kind={kind.value}",
        )
        return created

    async def update_checkpoint_media(
        self,
        media_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[CheckpointMediaService, Depends(get_checkpoint_media_service)],
        caption: Annotated[str | None, Form()] = None,
        order: Annotated[int | None, Form()] = None,
        title: Annotated[str | None, Form()] = None,
        content_url: Annotated[str | None, Form()] = None,
        content_text: Annotated[str | None, Form()] = None,
        image: Annotated[UploadFile | None, File()] = None,
    ) -> CheckpointMediaResponse:
        try:
            updated = await service.update_media(
                media_id,
                caption=caption,
                order=order,
                title=title,
                content_url=content_url,
                content_text=content_text,
                image=image,
            )
        except (ValidationError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        await record_audit(
            db,
            action="checkpoint.media_updated",
            actor=_actor(curr_user),
            target_type="checkpoint_media",
            target_id=str(media_id),
            note=f"checkpoint_id={updated.checkpoint_id}",
        )
        return updated

    async def delete_checkpoint_media(
        self,
        media_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[CheckpointMediaService, Depends(get_checkpoint_media_service)],
    ) -> None:
        await service.delete_media(media_id)
        await record_audit(
            db,
            action="checkpoint.media_deleted",
            actor=_actor(curr_user),
            target_type="checkpoint_media",
            target_id=str(media_id),
        )

    async def reorder_checkpoint_media(
        self,
        checkpoint_id: int,
        ordered_ids: list[int],
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[CheckpointMediaService, Depends(get_checkpoint_media_service)],
    ) -> list[CheckpointMediaResponse]:
        reordered = await service.reorder_media(checkpoint_id, ordered_ids)
        await record_audit(
            db,
            action="checkpoint.media_reordered",
            actor=_actor(curr_user),
            target_type="checkpoint",
            target_id=str(checkpoint_id),
            note=f"ordered_ids={ordered_ids}",
        )
        return reordered


router = CheckpointMediaController().router
