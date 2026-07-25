"""Business rules for the rally-guide view: guide-mode gating and
checkpoint-with-media/indications listing.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import RallyForbiddenError
from app.crud.crud_activity import rally_event
from app.crud.crud_rally_settings import rally_settings
from app.models.activity import EventType
from app.models.checkpoint import CheckPoint


class GuideService:
    """Guide-mode gating and checkpoint gallery listing for the guide view."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_checkpoints_with_gallery(self) -> list[CheckPoint]:
        """Every checkpoint for the current event, with media/indications
        eager-loaded, ordered by checkpoint order.

        Raises RallyForbiddenError when guide mode is not active and the
        current event is not Peddy Paper (which always allows the guide view).
        """
        event = await rally_event.get_current(self._db)

        settings = await rally_settings.get_or_create(self._db)
        guide_mode_on = settings.guide_mode_enabled and settings.guide_mode_active
        is_peddy_paper = event is not None and event.event_type == EventType.PEDDY_PAPER.value
        if not guide_mode_on and not is_peddy_paper:
            raise RallyForbiddenError("Guide mode is not active for this event")

        event_filter = CheckPoint.event_id == event.id if event else CheckPoint.event_id.is_(None)
        stmt = (
            select(CheckPoint)
            .where(event_filter)
            .options(
                selectinload(CheckPoint.media),
                selectinload(CheckPoint.guide_indications),
            )
            .order_by(CheckPoint.order)
        )
        return list((await self._db.scalars(stmt)).all())
