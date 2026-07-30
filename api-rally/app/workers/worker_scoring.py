"""Scoring worker.

When ``RECOMPUTE_OFF_PATH`` is enabled, write routes persist the raw activity
result and return immediately, leaving the expensive recompute to this worker.
It listens for activity-result changes and, off the request path, rescores the
affected activity (time-based rank shifts) and refreshes the affected team's
totals — which in turn publishes ``team.score_updated`` so the leaderboard
worker rebuilds the cached standings.

The recompute primitives it calls (``_recalculate_all_results_for_activity``,
``update_team_scores``) are not gated by the off-path flag, so the worker always
does the full work regardless of the flag's value.
"""

import logging
from typing import Any

from app.events import Channels
from app.services.scoring_service import ScoringService
from app.workers.base import BaseWorker
from app.workers.session import worker_session

logger = logging.getLogger(__name__)


class ScoringWorker(BaseWorker):
    """Recompute activity scores and team totals off the request path."""

    # Subscribe by pattern so every activity_result.{created,updated,deleted}
    # drives a recompute.
    patterns = [Channels.ALL_ACTIVITY_RESULT_EVENTS]

    async def handle_event(self, channel: str, data: dict[str, Any]) -> None:
        payload = data.get("payload") or {}
        activity_id = payload.get("activity_id")
        team_id = payload.get("team_id")
        if activity_id is None or team_id is None:
            logger.warning("[ScoringWorker] Missing ids in %s payload: %s", channel, payload)
            return

        logger.info(
            "[ScoringWorker] Recomputing activity %s / team %s after %s",
            activity_id,
            team_id,
            channel,
        )
        async with worker_session() as session:
            service = ScoringService(session)
            # Time-based activities couple every team's score through ranking, so
            # rescore the whole activity (no-op for other activity types).
            await service._recalculate_all_results_for_activity(activity_id)
            # Always refresh the directly-affected team: covers non-time-based
            # activities and deletions, where the team may no longer appear in
            # the activity's result set above.
            await service.update_team_scores(team_id)
