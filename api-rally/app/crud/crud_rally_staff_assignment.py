from typing import Optional, Sequence
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.crud.base import CRUDBase
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.schemas.rally_staff_assignment import (
    RallyStaffAssignmentCreate,
    RallyStaffAssignmentUpdate,
)


class CRUDRallyStaffAssignment(CRUDBase[RallyStaffAssignment, RallyStaffAssignmentCreate, RallyStaffAssignmentUpdate]):
    async def get_by_user_id(self, db: AsyncSession, user_id: int) -> Optional[RallyStaffAssignment]:
        """Get staff assignment for a specific user"""
        stmt = select(RallyStaffAssignment).where(RallyStaffAssignment.user_id == user_id)
        return await db.scalar(stmt)

    async def get_by_checkpoint_id(self, db: AsyncSession, checkpoint_id: int) -> Sequence[RallyStaffAssignment]:
        """Get all staff assignments for a specific checkpoint"""
        stmt = select(RallyStaffAssignment).where(RallyStaffAssignment.checkpoint_id == checkpoint_id)
        return (await db.scalars(stmt)).all()

    async def get_multi_with_checkpoint(self, db: AsyncSession) -> Sequence[RallyStaffAssignment]:
        """Get all staff assignments with checkpoint details loaded"""
        stmt = select(RallyStaffAssignment).options(selectinload(RallyStaffAssignment.checkpoint))
        return (await db.scalars(stmt)).all()

    async def create_or_update(self, db: AsyncSession, *, user_id: int, checkpoint_id: Optional[int] = None) -> Optional[RallyStaffAssignment]:
        """Create or update staff assignment for a user"""
        existing = await self.get_by_user_id(db, user_id)

        if existing:
            # Update existing assignment
            if checkpoint_id is None:
                # Remove assignment
                await db.delete(existing)
                await db.commit()
                return None
            else:
                # Update checkpoint
                existing.checkpoint_id = checkpoint_id
                await db.commit()
                # Eager-load the checkpoint relationship so callers can read it
                # without triggering a lazy load on the async session.
                await db.refresh(existing, ["checkpoint"])
                return existing
        else:
            # Create new assignment
            if checkpoint_id is not None:
                assignment = RallyStaffAssignment(user_id=user_id, checkpoint_id=checkpoint_id)
                db.add(assignment)
                await db.commit()
                await db.refresh(assignment, ["checkpoint"])
                return assignment
            return None


rally_staff_assignment = CRUDRallyStaffAssignment(RallyStaffAssignment)
