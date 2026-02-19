from typing import Optional, Sequence
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.models.team import Team
from app.models.checkpoint import CheckPoint
from app.schemas.checkpoint import CheckPointCreate, CheckPointUpdate
from app.core.config import settings


class CRUDCheckPoint(CRUDBase[CheckPoint, CheckPointCreate, CheckPointUpdate]):
    def get_next(self, db: Session, team_id: int) -> Optional[CheckPoint]:
        """Get the next checkpoint a team should visit based on order."""
        team = db.get(Team, team_id)

        if team is not None:
            # Get the order of the last checkpoint the team visited
            last_checkpoint_order = len(team.times)
            
            # Find the next checkpoint by order
            stmt = select(CheckPoint).where(CheckPoint.order == last_checkpoint_order + 1)
            checkpoint = db.scalar(stmt)
            return checkpoint

        return None

    def get_by_order(self, db: Session, order: int) -> Optional[CheckPoint]:
        """Get checkpoint by its order number."""
        stmt = select(CheckPoint).where(CheckPoint.order == order)
        return db.scalar(stmt)

    def get_all_ordered(self, db: Session) -> Sequence[CheckPoint]:
        """Get all checkpoints ordered by their order field."""
        stmt = select(CheckPoint).order_by(CheckPoint.order)
        return db.scalars(stmt).all()

    def get_max_order(self, db: Session) -> int:
        """Get the maximum order value among all checkpoints."""
        stmt = select(func.max(CheckPoint.order))
        result = db.scalar(stmt)
        return int(result) if result is not None else 0

    def reorder_checkpoints(self, db: Session, checkpoint_orders: dict[int, int]) -> None:
        """Reorder checkpoints by updating their order values."""
        from sqlalchemy import text
        
        # Use raw SQL to avoid unique constraint violations
        # First, set all affected checkpoints to negative orders
        for checkpoint_id in checkpoint_orders.keys():
            db.execute(
                text(f"UPDATE {settings.SCHEMA_NAME}.checkpoints SET \"order\" = -:checkpoint_id WHERE id = :checkpoint_id"),
                {"checkpoint_id": checkpoint_id}
            )
        
        db.commit()
        
        # Then set the final orders
        for checkpoint_id, new_order in checkpoint_orders.items():
            db.execute(
                text(f"UPDATE {settings.SCHEMA_NAME}.checkpoints SET \"order\" = :new_order WHERE id = :checkpoint_id"),
                {"new_order": new_order, "checkpoint_id": checkpoint_id}
            )
        
        db.commit()

    def count(self, db: Session) -> int:
        """Get the total number of checkpoints."""
        stmt = select(func.count()).select_from(CheckPoint)
        return db.scalar(stmt) or 0


checkpoint = CRUDCheckPoint(CheckPoint)
