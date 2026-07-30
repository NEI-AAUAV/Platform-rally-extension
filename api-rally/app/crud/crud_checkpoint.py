from collections.abc import Sequence

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.config import settings
from app.crud._event_scope import current_event_id
from app.crud.base import CRUDBase
from app.models.checkpoint import CheckPoint
from app.models.team import Team
from app.schemas.checkpoint import CheckPointCreate, CheckPointUpdate


def _event_filter(event_id: int) -> "ColumnElement[bool]":
    """Match the current event's checkpoints, including legacy NULL rows."""
    return (CheckPoint.event_id == event_id) | (CheckPoint.event_id.is_(None))


class CRUDCheckPoint(CRUDBase[CheckPoint, CheckPointCreate, CheckPointUpdate]):
    async def create(
        self, db: AsyncSession, *, obj_in: CheckPointCreate, commit: bool = False
    ) -> CheckPoint:
        """Create a checkpoint stamped with the current event id."""
        event_id = await current_event_id(db)
        db_obj = CheckPoint(**obj_in.model_dump(), event_id=event_id)
        db.add(db_obj)
        if commit:
            await db.commit()
        else:
            await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def get_next(self, db: AsyncSession, team_id: int) -> CheckPoint | None:
        """Get the next checkpoint a team should visit based on order."""
        team = await db.get(Team, team_id)

        if team is not None:
            # Get the order of the last checkpoint the team visited
            last_checkpoint_order = len(team.times)

            event_id = await current_event_id(db)
            # Find the next checkpoint by order within the current event
            stmt = select(CheckPoint).where(
                CheckPoint.order == last_checkpoint_order + 1,
                _event_filter(event_id),
            )
            checkpoint: CheckPoint | None = await db.scalar(stmt)
            return checkpoint

        return None

    async def get_by_order(self, db: AsyncSession, order: int) -> CheckPoint | None:
        """Get checkpoint by its order number (within the current event)."""
        event_id = await current_event_id(db)
        stmt = select(CheckPoint).where(CheckPoint.order == order, _event_filter(event_id))
        result: CheckPoint | None = await db.scalar(stmt)
        return result

    async def get_all_ordered(self, db: AsyncSession) -> Sequence[CheckPoint]:
        """Get the current event's checkpoints ordered by their order field."""
        event_id = await current_event_id(db)
        stmt = select(CheckPoint).where(_event_filter(event_id)).order_by(CheckPoint.order)
        return (await db.scalars(stmt)).all()

    async def get_max_order(self, db: AsyncSession) -> int:
        """Get the maximum order value among the current event's checkpoints."""
        event_id = await current_event_id(db)
        stmt = select(func.max(CheckPoint.order)).where(_event_filter(event_id))
        result = await db.scalar(stmt)
        return int(result) if result is not None else 0

    async def reorder_checkpoints(
        self, db: AsyncSession, checkpoint_orders: dict[int, int]
    ) -> None:
        """Reorder checkpoints by updating their order values."""
        # Use raw SQL to avoid unique constraint violations
        # First, set all affected checkpoints to negative orders
        for checkpoint_id in checkpoint_orders:
            await db.execute(
                text(
                    f'UPDATE {settings.SCHEMA_NAME}.checkpoints SET "order" = -:checkpoint_id '
                    f"WHERE id = :checkpoint_id"
                ),
                {"checkpoint_id": checkpoint_id},
            )

        await db.commit()

        # Then set the final orders
        for checkpoint_id, new_order in checkpoint_orders.items():
            await db.execute(
                text(
                    f'UPDATE {settings.SCHEMA_NAME}.checkpoints SET "order" = :new_order '
                    f"WHERE id = :checkpoint_id"
                ),
                {"new_order": new_order, "checkpoint_id": checkpoint_id},
            )

        await db.commit()

    async def count(self, db: AsyncSession) -> int:
        """Get the total number of checkpoints in the current event."""
        event_id = await current_event_id(db)
        stmt = select(func.count()).select_from(CheckPoint).where(_event_filter(event_id))
        return await db.scalar(stmt) or 0


checkpoint = CRUDCheckPoint(CheckPoint)
