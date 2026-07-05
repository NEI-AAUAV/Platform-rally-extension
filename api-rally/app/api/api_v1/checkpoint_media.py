from typing import Any, List, Optional
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.abac_deps import require_checkpoint_management_permission
from app.crud.crud_checkpoint_media import checkpoint_media as crud_media
from app.schemas.checkpoint_media import (
    CheckpointMediaCreate,
    CheckpointMediaResponse,
    CheckpointMediaUpdate,
)
from app.models.checkpoint_media import MediaKind
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store
from app import crud

router = APIRouter()


async def _get_checkpoint_or_404(db: AsyncSession, checkpoint_id: int) -> Any:
    cp = await crud.checkpoint.get(db=db, id=checkpoint_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return cp


@router.get("/checkpoint/{checkpoint_id}/media", response_model=List[CheckpointMediaResponse])
async def list_checkpoint_media(
    checkpoint_id: int,
    db: AsyncSession = Depends(deps.get_db),
) -> List[CheckpointMediaResponse]:
    await _get_checkpoint_or_404(db, checkpoint_id)
    items = await crud_media.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
    return [CheckpointMediaResponse.model_validate(item) for item in items]


@router.post(
    "/checkpoint/{checkpoint_id}/media",
    response_model=CheckpointMediaResponse,
    status_code=201,
    dependencies=[Depends(require_checkpoint_management_permission)],
)
async def create_checkpoint_media(
    checkpoint_id: int,
    kind: MediaKind = Form(...),
    caption: Optional[str] = Form(None),
    order: int = Form(0),
    image: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(deps.get_db),
) -> CheckpointMediaResponse:
    await _get_checkpoint_or_404(db, checkpoint_id)
    image_url: Optional[str] = None
    if image and image.filename:
        image_url = await validate_and_store(
            image=image,
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix=f"rally/checkpoints/{checkpoint_id}/media",
        )
    obj_in = CheckpointMediaCreate(kind=kind, caption=caption, order=order)
    created = await crud_media.create(db, checkpoint_id=checkpoint_id, obj_in=obj_in, image_url=image_url)
    return CheckpointMediaResponse.model_validate(created)


@router.put(
    "/checkpoint/media/{media_id}",
    response_model=CheckpointMediaResponse,
    dependencies=[Depends(require_checkpoint_management_permission)],
)
async def update_checkpoint_media(
    media_id: int,
    caption: Optional[str] = Form(None),
    order: Optional[int] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(deps.get_db),
) -> CheckpointMediaResponse:
    db_obj = await crud_media.get(db, id=media_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Media not found")
    image_url: Optional[str] = None
    if image and image.filename:
        image_url = await validate_and_store(
            image=image,
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix=f"rally/checkpoints/{db_obj.checkpoint_id}/media",
        )
    obj_in = CheckpointMediaUpdate(caption=caption, order=order)
    updated = await crud_media.update(db, db_obj=db_obj, obj_in=obj_in, image_url=image_url)
    return CheckpointMediaResponse.model_validate(updated)


@router.delete(
    "/checkpoint/media/{media_id}",
    status_code=204,
    dependencies=[Depends(require_checkpoint_management_permission)],
)
async def delete_checkpoint_media(
    media_id: int,
    db: AsyncSession = Depends(deps.get_db),
) -> None:
    db_obj = await crud_media.get(db, id=media_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Media not found")
    await crud_media.delete(db, db_obj=db_obj)


@router.post(
    "/checkpoint/{checkpoint_id}/media/reorder",
    response_model=List[CheckpointMediaResponse],
    dependencies=[Depends(require_checkpoint_management_permission)],
)
async def reorder_checkpoint_media(
    checkpoint_id: int,
    ordered_ids: List[int],
    db: AsyncSession = Depends(deps.get_db),
) -> List[CheckpointMediaResponse]:
    await _get_checkpoint_or_404(db, checkpoint_id)
    items = await crud_media.reorder(db, checkpoint_id=checkpoint_id, ordered_ids=ordered_ids)
    return [CheckpointMediaResponse.model_validate(item) for item in items]
