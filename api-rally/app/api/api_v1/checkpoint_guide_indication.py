from typing import Annotated, Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.abac_deps import require_checkpoint_management_permission
from app.crud.crud_checkpoint_guide_indication import (
    checkpoint_guide_indication as crud_indication,
)
from app.schemas.checkpoint_guide_indication import (
    CheckpointGuideIndication,
    CheckpointGuideIndicationCreate,
    CheckpointGuideIndicationUpdate,
)
from app import crud

router = APIRouter()


async def _get_checkpoint_or_404(db: AsyncSession, checkpoint_id: int) -> Any:
    # CRUDBase.get() raises NotFoundException (mapped to a 404 response by the
    # global exception handler) rather than returning None, so this branch is
    # unreachable in practice; kept as a defensive guard.
    cp = await crud.checkpoint.get(db=db, id=checkpoint_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return cp


@router.get(
    "/checkpoint/{checkpoint_id}/guide-indications",
    # Indications include expected answers, so they must never be readable by
    # participants — only guides, staff, and admins.
    dependencies=[Depends(deps.get_guide)],
    responses={404: {"description": "Checkpoint not found"}},
)
async def list_guide_indications(
    checkpoint_id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> List[CheckpointGuideIndication]:
    await _get_checkpoint_or_404(db, checkpoint_id)
    items = await crud_indication.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
    return [CheckpointGuideIndication.model_validate(item) for item in items]


@router.post(
    "/checkpoint/{checkpoint_id}/guide-indications",
    status_code=201,
    dependencies=[Depends(require_checkpoint_management_permission)],
    responses={404: {"description": "Checkpoint not found"}},
)
async def create_guide_indication(
    checkpoint_id: int,
    obj_in: CheckpointGuideIndicationCreate,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> CheckpointGuideIndication:
    await _get_checkpoint_or_404(db, checkpoint_id)
    created = await crud_indication.create(db, checkpoint_id=checkpoint_id, obj_in=obj_in)
    return CheckpointGuideIndication.model_validate(created)


@router.put(
    "/checkpoint/guide-indications/{indication_id}",
    dependencies=[Depends(require_checkpoint_management_permission)],
    responses={404: {"description": "Guide indication not found"}},
)
async def update_guide_indication(
    indication_id: int,
    obj_in: CheckpointGuideIndicationUpdate,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> CheckpointGuideIndication:
    db_obj = await crud_indication.get(db, id=indication_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Guide indication not found")
    updated = await crud_indication.update(db, db_obj=db_obj, obj_in=obj_in)
    return CheckpointGuideIndication.model_validate(updated)


@router.delete(
    "/checkpoint/guide-indications/{indication_id}",
    status_code=204,
    dependencies=[Depends(require_checkpoint_management_permission)],
    responses={404: {"description": "Guide indication not found"}},
)
async def delete_guide_indication(
    indication_id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> None:
    db_obj = await crud_indication.get(db, id=indication_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Guide indication not found")
    await crud_indication.delete(db, db_obj=db_obj)
