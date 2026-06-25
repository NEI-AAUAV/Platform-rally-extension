"""Badge worker.

Listens for activity-result changes, evaluates the badge rules and awards any
newly earned badges, publishing a ``badge.awarded`` event per award so the SPA
can react (notifications, profile refresh). Badges are permanent, so deletions
are ignored.
"""

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.badges import BadgeAward, evaluate_result
from app.events import (
    BadgeAwardedEvent,
    BadgeAwardedPayload,
    Channels,
    EventType,
    publish_event,
)
from app.models.activity import ActivityResult
from app.services import badge_service
from app.workers.base import BaseWorker
from app.workers.session import worker_session

logger = logging.getLogger(__name__)

# Result lifecycle events that can earn a badge. A deletion never revokes one.
_AWARDING_EVENTS = {
    EventType.ACTIVITY_RESULT_CREATED.value,
    EventType.ACTIVITY_RESULT_UPDATED.value,
}


class BadgesWorker(BaseWorker):
    """Evaluate and award team badges from activity-result events."""

    patterns = [Channels.ALL_ACTIVITY_RESULT_EVENTS]

    async def handle_event(self, channel: str, data: dict[str, Any]) -> None:
        if data.get("event_type") not in _AWARDING_EVENTS:
            return
        result_id = (data.get("payload") or {}).get("result_id")
        if result_id is None:
            return

        async with worker_session() as session:
            result = await self._load_result(session, result_id)
            if result is None:
                # Result vanished between commit and handling; nothing to award.
                return
            awards = await evaluate_result(session, result)
            for award in awards:
                await self._award(session, award)

    async def _load_result(
        self, session: AsyncSession, result_id: int
    ) -> ActivityResult | None:
        stmt = (
            select(ActivityResult)
            .options(joinedload(ActivityResult.activity))
            .where(ActivityResult.id == result_id)
        )
        return (await session.scalars(stmt)).first()

    async def _award(self, session: AsyncSession, award: BadgeAward) -> None:
        badge = await badge_service.award_badge(
            session,
            team_id=award.team_id,
            badge_type=award.badge_type,
            activity_id=award.activity_id,
            meta=award.meta,
        )
        if badge is None:
            # Already held — idempotent no-op, no event.
            return
        logger.info(
            "[BadgesWorker] Team %s earned %s", award.team_id, award.badge_type.value
        )
        await publish_event(
            BadgeAwardedEvent(
                payload=BadgeAwardedPayload(
                    team_id=award.team_id,
                    badge_type=award.badge_type.value,
                    activity_id=award.activity_id,
                )
            )
        )
