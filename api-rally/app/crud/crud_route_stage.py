from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud._event_scope import current_event_id
from app.crud.base import CRUDBase
from app.models.route_stage import RouteStage
from app.schemas.route_stage import RouteStageCreate, RouteStageUpdate


class CRUDRouteStage(CRUDBase[RouteStage, RouteStageCreate, RouteStageUpdate]):
    async def create(
        self, db: AsyncSession, *, obj_in: RouteStageCreate, commit: bool = False
    ) -> RouteStage:
        """Create a stage stamped with the current event id."""
        event_id = await current_event_id(db)
        db_obj = RouteStage(**obj_in.model_dump(), event_id=event_id)
        db.add(db_obj)
        if commit:
            await db.commit()
        else:
            await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def get_all_ordered(self, db: AsyncSession) -> Sequence[RouteStage]:
        event_id = await current_event_id(db)
        stmt = (
            select(RouteStage)
            .where((RouteStage.event_id == event_id) | (RouteStage.event_id.is_(None)))
            .order_by(RouteStage.order)
        )
        return (await db.scalars(stmt)).all()

    async def next_order(self, db: AsyncSession) -> int:
        event_id = await current_event_id(db)
        stmt = select(func.max(RouteStage.order)).where(
            (RouteStage.event_id == event_id) | (RouteStage.event_id.is_(None))
        )
        return int(await db.scalar(stmt) or 0) + 1


route_stage = CRUDRouteStage(RouteStage)
