from typing import Optional, Sequence
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select

from app.crud.base import CRUDBase
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.schemas.rally_staff_assignment import (
    RallyStaffAssignmentCreate,
    RallyStaffAssignmentUpdate,
)


class CRUDRallyStaffAssignment(CRUDBase[RallyStaffAssignment, RallyStaffAssignmentCreate, RallyStaffAssignmentUpdate]):
    def get_by_user_id(self, db: Session, user_id: int) -> Optional[RallyStaffAssignment]:
        """Get staff assignment for a specific user"""
        stmt = select(RallyStaffAssignment).where(RallyStaffAssignment.user_id == user_id)
        return db.scalar(stmt)
    
    def get_by_checkpoint_id(self, db: Session, checkpoint_id: int) -> Sequence[RallyStaffAssignment]:
        """Get all staff assignments for a specific checkpoint"""
        stmt = select(RallyStaffAssignment).where(RallyStaffAssignment.checkpoint_id == checkpoint_id)
        return db.scalars(stmt).all()
    
    def get_multi_with_checkpoint(self, db: Session) -> Sequence[RallyStaffAssignment]:
        """Get all staff assignments with checkpoint details loaded"""
        stmt = select(RallyStaffAssignment).options(selectinload(RallyStaffAssignment.checkpoint))
        return db.scalars(stmt).all()
    
    def create_or_update(self, db: Session, *, user_id: int, checkpoint_id: Optional[int] = None) -> Optional[RallyStaffAssignment]:
        """Create or update staff assignment for a user"""
        existing = self.get_by_user_id(db, user_id)
        
        if existing:
            # Update existing assignment
            if checkpoint_id is None:
                # Remove assignment
                db.delete(existing)
                db.commit()
                return None
            else:
                # Update checkpoint
                existing.checkpoint_id = checkpoint_id
                db.commit()
                db.refresh(existing)
                return existing
        else:
            # Create new assignment
            if checkpoint_id is not None:
                assignment = RallyStaffAssignment(user_id=user_id, checkpoint_id=checkpoint_id)
                db.add(assignment)
                db.commit()
                db.refresh(assignment)
                return assignment
            return None


rally_staff_assignment = CRUDRallyStaffAssignment(RallyStaffAssignment)
