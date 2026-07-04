from typing import List
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


async def _get_checkpoint_or_404(db: AsyncSession, checkpoint_id: int):
    cp = await crud.checkpoint.get(db=db, id=checkpoint_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return cp


@router.get(
    "/checkpoint/{checkpoint_id}/guide-indications",
    response_model=List[CheckpointGuideIndication],
)
async def list_guide_indications(
    checkpoint_id: int,
    db: AsyncSession = Depends(deps.get_db),
) -> List[CheckpointGuideIndication]:
    await _get_checkpoint_or_404(db, checkpoint_id)
    return await crud_indication.get_by_checkpoint(db, checkpoint_id=checkpoint_id)


@router.post(
    "/checkpoint/{checkpoint_id}/guide-indications",
    response_model=CheckpointGuideIndication,
    status_code=201,
    dependencies=[Depends(require_checkpoint_management_permission)],
)
async def create_guide_indication(
    checkpoint_id: int,
    obj_in: CheckpointGuideIndicationCreate,
    db: AsyncSession = Depends(deps.get_db),
) -> CheckpointGuideIndication:
    await _get_checkpoint_or_404(db, checkpoint_id)
    return await crud_indication.create(db, checkpoint_id=checkpoint_id, obj_in=obj_in)


@router.put(
    "/checkpoint/guide-indications/{indication_id}",
    response_model=CheckpointGuideIndication,
    dependencies=[Depends(require_checkpoint_management_permission)],
)
async def update_guide_indication(
    indication_id: int,
    obj_in: CheckpointGuideIndicationUpdate,
    db: AsyncSession = Depends(deps.get_db),
) -> CheckpointGuideIndication:
    db_obj = await crud_indication.get(db, id=indication_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Guide indication not found")
    return await crud_indication.update(db, db_obj=db_obj, obj_in=obj_in)


@router.delete(
    "/checkpoint/guide-indications/{indication_id}",
    status_code=204,
    dependencies=[Depends(require_checkpoint_management_permission)],
)
async def delete_guide_indication(
    indication_id: int,
    db: AsyncSession = Depends(deps.get_db),
) -> None:
    db_obj = await crud_indication.get(db, id=indication_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Guide indication not found")
    await crud_indication.delete(db, db_obj=db_obj)
