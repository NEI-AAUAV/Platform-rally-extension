"""Leaderboard worker.

Listens for any change that affects team standings, recomputes the global
ranking from Postgres and caches the rendered result in Redis, then publishes a
refresh signal so connected SSE clients can push the update.
"""

import logging
from typing import Any

from app.core.redis import get_async_redis_client
from app.events.channels import Channels
from app.services import leaderboard_cache
from app.services.scoring_service import ScoringService
from app.workers.base import BaseWorker
from app.workers.session import worker_session

logger = logging.getLogger(__name__)


class LeaderboardWorker(BaseWorker):
    """Keep the cached global leaderboard in sync with scoring changes."""

    patterns = [
        Channels.ALL_ACTIVITY_RESULT_EVENTS,
        Channels.ALL_TEAM_EVENTS,
    ]

    async def handle_event(self, channel: str, data: dict[str, Any]) -> None:
        logger.info("[LeaderboardWorker] Rebuilding leaderboard after %s", channel)
        await self._rebuild()

    async def _rebuild(self) -> None:
        async with worker_session() as session:
            ranking = await ScoringService(session).get_team_ranking()

        client = get_async_redis_client()
        try:
            await leaderboard_cache.write_global_leaderboard(client, ranking)
            await client.publish(Channels.LEADERBOARD_REFRESHED, "1")
        finally:
            await client.aclose()
