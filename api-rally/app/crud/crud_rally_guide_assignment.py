from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud._event_scope import current_event_id
from app.crud.base import CRUDBase
from app.models.checkpoint import CheckPoint
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.schemas.rally_guide_assignment import (
    RallyGuideAssignmentCreate,
    RallyGuideAssignmentUpdate,
)


class CRUDRallyGuideAssignment(
    CRUDBase[RallyGuideAssignment, RallyGuideAssignmentCreate, RallyGuideAssignmentUpdate]
):
    async def get_by_user_id(self, db: AsyncSession, user_id: int) -> RallyGuideAssignment | None:
        """Get guide assignment for a specific user"""
        stmt = select(RallyGuideAssignment).where(RallyGuideAssignment.user_id == user_id)
        result: RallyGuideAssignment | None = await db.scalar(stmt)
        return result

    async def get_by_checkpoint_id(
        self, db: AsyncSession, checkpoint_id: int
    ) -> Sequence[RallyGuideAssignment]:
        """Get all guide assignments for a specific checkpoint"""
        stmt = select(RallyGuideAssignment).where(
            RallyGuideAssignment.checkpoint_id == checkpoint_id
        )
        return (await db.scalars(stmt)).all()

    async def get_multi_with_checkpoint(self, db: AsyncSession) -> Sequence[RallyGuideAssignment]:
        """Get guide assignments scoped to the current event's checkpoints."""
        event_id = await current_event_id(db)
        stmt = (
            select(RallyGuideAssignment)
            .join(CheckPoint, RallyGuideAssignment.checkpoint_id == CheckPoint.id)
            .where((CheckPoint.event_id == event_id) | (CheckPoint.event_id.is_(None)))
            .options(selectinload(RallyGuideAssignment.checkpoint))
        )
        return (await db.scalars(stmt)).all()

    async def create_or_update(
        self, db: AsyncSession, *, user_id: int, checkpoint_id: int | None = None
    ) -> RallyGuideAssignment | None:
        """Create or update guide assignment for a user"""
        existing = await self.get_by_user_id(db, user_id)

        if existing:
            if checkpoint_id is None:
                await db.delete(existing)
                await db.commit()
                return None
            existing.checkpoint_id = checkpoint_id
            await db.commit()
            await db.refresh(existing, ["checkpoint"])
            return existing
        if checkpoint_id is not None:
            assignment = RallyGuideAssignment(user_id=user_id, checkpoint_id=checkpoint_id)
            db.add(assignment)
            await db.commit()
            await db.refresh(assignment, ["checkpoint"])
            return assignment
        return None


rally_guide_assignment = CRUDRallyGuideAssignment(RallyGuideAssignment)
