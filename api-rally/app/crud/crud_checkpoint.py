from collections.abc import Sequence

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.config import settings
from app.crud._event_scope import current_event_id
from app.crud.base import CRUDBase
from app.models.checkpoint import CheckPoint
from app.models.route_stage import RouteStage
from app.models.team import Team
from app.schemas.checkpoint import CheckPointCreate, CheckPointUpdate

# Sort key for posts that belong to no stage: they follow every staged post.
_UNSTAGED_SORT_KEY = 1_000_000


def _event_filter(event_id: int) -> "ColumnElement[bool]":
    """Match the current event's checkpoints, including legacy NULL rows."""
    return (CheckPoint.event_id == event_id) | (CheckPoint.event_id.is_(None))


def _published_filter() -> "ColumnElement[bool]":
    """Exclude posts still being planned.

    Drafts are invisible to every team-facing path — route, count, progress
    and the "next post" lookup all go through this. Admin callers opt back in
    with ``include_drafts=True``.
    """
    return CheckPoint.is_draft.is_(False)


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
        """Next checkpoint by positional ``len(team.times)`` count.

        Internal to the staff-eval advance machinery
        (``advance_team_to_next_checkpoint``), which relies on the pointer-append
        semantics. Read-facing "which post is the team hunting" callers must use
        ``route_progress.current_checkpoint_order`` instead — it counts resolved
        posts, not the inflated ``team.times`` length.
        """
        team = await db.get(Team, team_id)

        if team is not None:
            # Get the order of the last checkpoint the team visited
            last_checkpoint_order = len(team.times)

            event_id = await current_event_id(db)
            # Find the next checkpoint by order within the current event
            stmt = select(CheckPoint).where(
                CheckPoint.order == last_checkpoint_order + 1,
                _event_filter(event_id),
                _published_filter(),
            )
            checkpoint: CheckPoint | None = await db.scalar(stmt)
            return checkpoint

        return None

    async def get_by_order(self, db: AsyncSession, order: int) -> CheckPoint | None:
        """Get checkpoint by its order number (within the current event).

        Drafts are included: order is unique across the whole event, so an
        order-collision check that ignored them would hit the database
        constraint instead of returning a clean error.
        """
        event_id = await current_event_id(db)
        stmt = select(CheckPoint).where(CheckPoint.order == order, _event_filter(event_id))
        result: CheckPoint | None = await db.scalar(stmt)
        return result

    async def get_all_ordered(
        self, db: AsyncSession, *, include_drafts: bool = False
    ) -> Sequence[CheckPoint]:
        """Get the current event's checkpoints ordered by their order field.

        Drafts are left out by default — this is the query the route, the
        progress calculation and the scoreboard all read.
        """
        event_id = await current_event_id(db)
        stmt = select(CheckPoint).where(_event_filter(event_id))
        if not include_drafts:
            stmt = stmt.where(_published_filter())
        return (await db.scalars(stmt.order_by(CheckPoint.order))).all()

    async def get_max_order(self, db: AsyncSession) -> int:
        """Get the maximum order value among the current event's checkpoints.

        Counts drafts: this is what new posts are appended after, and two
        rows may not share an order whatever their state.
        """
        event_id = await current_event_id(db)
        stmt = select(func.max(CheckPoint.order)).where(_event_filter(event_id))
        result = await db.scalar(stmt)
        return int(result) if result is not None else 0

    async def resequence(self, db: AsyncSession, *, commit: bool = True) -> None:
        """Renumber the event's checkpoints so published posts run 1..N and
        drafts sit after them, each keeping its relative position.

        Progress is positional: ``team.times`` is indexed by order and code
        compares ``len(team.times) >= cp.order``, so a gap left by a drafted
        post in the middle of the route would silently break completion.
        Renumbering after any change to draft state keeps the published route
        contiguous.
        """
        event_id = await current_event_id(db)
        # Stage first, then position inside it: a stage is a contiguous block
        # of orders, which is what lets the stage rules be expressed as order
        # comparisons at all. Posts outside every stage sort last (the
        # coalesce), as does anything still in draft.
        stage_order = func.coalesce(RouteStage.order, _UNSTAGED_SORT_KEY)
        stmt = (
            select(CheckPoint)
            .outerjoin(RouteStage, CheckPoint.stage_id == RouteStage.id)
            .where(_event_filter(event_id))
            .order_by(CheckPoint.is_draft, stage_order, CheckPoint.order)
        )
        checkpoints = list((await db.scalars(stmt)).all())
        target = {cp.id: position for position, cp in enumerate(checkpoints, start=1)}
        if all(cp.order == target[cp.id] for cp in checkpoints):
            return

        # Two passes through negative orders: the unique (event_id, order)
        # constraint rejects any intermediate state where two rows collide.
        for cp in checkpoints:
            cp.order = -cp.id
        await db.flush()
        for cp in checkpoints:
            cp.order = target[cp.id]
        await db.flush()
        if commit:
            await db.commit()

    async def count(self, db: AsyncSession, *, include_drafts: bool = False) -> int:
        """Get the number of checkpoints in the current event."""
        event_id = await current_event_id(db)
        stmt = select(func.count()).select_from(CheckPoint).where(_event_filter(event_id))
        if not include_drafts:
            stmt = stmt.where(_published_filter())
        return await db.scalar(stmt) or 0

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


checkpoint = CRUDCheckPoint(CheckPoint)
