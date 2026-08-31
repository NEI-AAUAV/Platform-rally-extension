from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
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
from app.schemas.user import DetailedUser
from app.services.audit_service import AuditActor, record_audit

CHECKPOINT_NOT_FOUND = "Checkpoint not found"
GUIDE_INDICATION_NOT_FOUND = "Guide indication not found"

# What an indication says is what a team pays points to unlock, so editing one
# mid-event changes the game. Settings, staff assignments, arrivals and
# check-ins were all audited; this and checkpoint media were the two mutations
# that left no trail at all.
_AUDITED_FIELDS = ("hint", "question", "expected_answer", "order")


def _actor(curr_user: DetailedUser) -> AuditActor:
    return AuditActor(id=str(curr_user.id), name=curr_user.name, kind="user")


def _snapshot(obj: Any) -> dict[str, Any]:
    return {field: getattr(obj, field) for field in _AUDITED_FIELDS}


def _diff(before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        field: {"from": before[field], "to": after[field]}
        for field in _AUDITED_FIELDS
        if before[field] != after[field]
    }


class CheckpointGuideIndicationController:
    """REST controller for checkpoint guide indications (hints for guides)."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/checkpoint/{checkpoint_id}/guide-indications",
            self.list_guide_indications,
            methods=["GET"],
            name="list_guide_indications",
            # Indications include expected answers, so they must never be readable by
            # participants — only guides, staff, and admins.
            dependencies=[Depends(deps.get_guide)],
            responses={404: {"description": CHECKPOINT_NOT_FOUND}},
        )
        self.router.add_api_route(
            "/checkpoint/{checkpoint_id}/guide-indications",
            self.create_guide_indication,
            methods=["POST"],
            status_code=201,
            name="create_guide_indication",
            dependencies=[Depends(require_checkpoint_management_permission)],
            responses={404: {"description": CHECKPOINT_NOT_FOUND}},
        )
        self.router.add_api_route(
            "/checkpoint/guide-indications/{indication_id}",
            self.update_guide_indication,
            methods=["PUT"],
            name="update_guide_indication",
            dependencies=[Depends(require_checkpoint_management_permission)],
            responses={404: {"description": GUIDE_INDICATION_NOT_FOUND}},
        )
        self.router.add_api_route(
            "/checkpoint/guide-indications/{indication_id}",
            self.delete_guide_indication,
            methods=["DELETE"],
            status_code=204,
            name="delete_guide_indication",
            dependencies=[Depends(require_checkpoint_management_permission)],
            responses={404: {"description": GUIDE_INDICATION_NOT_FOUND}},
        )

    async def _get_checkpoint_or_404(self, db: AsyncSession, checkpoint_id: int) -> Any:
        # CRUDBase.get() raises RallyNotFoundError (mapped to a 404 response by the
        # global exception handler) rather than returning None, so this branch is
        # unreachable in practice; kept as a defensive guard.
        cp = await crud.checkpoint.get(db=db, id=checkpoint_id)
        if not cp:
            raise HTTPException(status_code=404, detail=CHECKPOINT_NOT_FOUND)
        return cp

    async def list_guide_indications(
        self,
        checkpoint_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
    ) -> list[CheckpointGuideIndication]:
        await self._get_checkpoint_or_404(db, checkpoint_id)
        items = await crud_indication.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
        return [CheckpointGuideIndication.model_validate(item) for item in items]

    async def create_guide_indication(
        self,
        checkpoint_id: int,
        obj_in: CheckpointGuideIndicationCreate,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
    ) -> CheckpointGuideIndication:
        cp = await self._get_checkpoint_or_404(db, checkpoint_id)
        created = await crud_indication.create(db, checkpoint_id=checkpoint_id, obj_in=obj_in)
        await record_audit(
            db,
            action="checkpoint.guide_indication_created",
            actor=_actor(curr_user),
            target_type="checkpoint_guide_indication",
            target_id=str(created.id),
            event_id=cp.event_id,
            note=f"checkpoint_id={checkpoint_id} order={created.order}",
        )
        return CheckpointGuideIndication.model_validate(created)

    async def update_guide_indication(
        self,
        indication_id: int,
        obj_in: CheckpointGuideIndicationUpdate,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
    ) -> CheckpointGuideIndication:
        db_obj = await crud_indication.get(db, id=indication_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail=GUIDE_INDICATION_NOT_FOUND)
        before = _snapshot(db_obj)
        checkpoint_id = db_obj.checkpoint_id
        updated = await crud_indication.update(db, db_obj=db_obj, obj_in=obj_in)
        await record_audit(
            db,
            action="checkpoint.guide_indication_updated",
            actor=_actor(curr_user),
            target_type="checkpoint_guide_indication",
            target_id=str(indication_id),
            changes=_diff(before, _snapshot(updated)),
            note=f"checkpoint_id={checkpoint_id}",
        )
        return CheckpointGuideIndication.model_validate(updated)

    async def delete_guide_indication(
        self,
        indication_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
    ) -> None:
        db_obj = await crud_indication.get(db, id=indication_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail="Guide indication not found")
        checkpoint_id = db_obj.checkpoint_id
        order = db_obj.order
        await crud_indication.delete(db, db_obj=db_obj)
        await record_audit(
            db,
            action="checkpoint.guide_indication_deleted",
            actor=_actor(curr_user),
            target_type="checkpoint_guide_indication",
            target_id=str(indication_id),
            note=f"checkpoint_id={checkpoint_id} order={order}",
        )


router = CheckpointGuideIndicationController().router
