"""Business rules for team QR self-check-in: feature gating, cross-event
guards, replay protection, and staff-scan status derivation.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.api_v1.staff_evaluation_utils import checkin_team_to_checkpoint
from app.core.config import Settings
from app.core.exceptions import RallyConflictError, RallyNotFoundError
from app.core.redis import get_async_redis_client
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import CRUDTeam
from app.events import TeamCheckpointAdvancedEvent, TeamCheckpointAdvancedPayload, publish_event
from app.models.checkpoint import CheckPoint
from app.models.team import Team
from app.services.event_scope import CHECKPOINT_NOT_FOUND
from app.services.route_progress import progress_for_team, unreachable_message

logger = logging.getLogger(__name__)


class CheckinService:
    """Team QR self-check-in and staff-scan identification lifecycle."""

    def __init__(
        self, db: AsyncSession, checkpoint_crud: CRUDCheckPoint, team_crud: CRUDTeam
    ) -> None:
        self._db = db
        self._checkpoint_crud = checkpoint_crud
        self._team_crud = team_crud

    async def claim_nonce(self, nonce: str, team_id: int, settings: Settings) -> bool:
        """Best-effort single-use guard for one (token, team) pair.

        Returns True when the claim is fresh, False when already claimed. Fails
        open (returns True) if Redis is unavailable — sequential ordering
        remains the authoritative guard, so a transient Redis outage never
        blocks legit teams.
        """
        key = f"rally:checkin:{nonce}:{team_id}"
        client = get_async_redis_client()
        try:
            was_set = await client.set(key, "1", nx=True, ex=settings.CHECKIN_TOKEN_TTL_SECONDS)
            return bool(was_set)
        except Exception as exc:  # noqa: BLE001 — replay guard is best-effort
            logger.warning("Check-in replay guard unavailable: %s", exc)
            return True
        finally:
            await client.aclose()

    async def get_checkpoint_or_raise(self, checkpoint_id: int) -> CheckPoint:
        # NOTE: CRUDBase.get() raises RallyNotFoundError itself instead of
        # returning None when the row is missing, so the `is None` guard below
        # is unreachable dead code in practice; kept as defensive documentation
        # of the contract in case `.get()`'s behavior ever changes.
        checkpoint = await self._checkpoint_crud.get(self._db, id=checkpoint_id)
        if checkpoint is None:
            raise RallyNotFoundError(CHECKPOINT_NOT_FOUND)
        return checkpoint

    async def get_team_or_raise(self, team_id: int) -> Team:
        team_obj = await self._team_crud.get(self._db, id=team_id)
        if team_obj is None:
            raise RallyNotFoundError("Team not found")
        return team_obj

    async def check_in_and_publish(self, team_id: int, checkpoint: CheckPoint) -> None:
        """Record the visit and publish the checkpoint-advanced event."""
        await checkin_team_to_checkpoint(self._db, team_id, checkpoint.id)
        await publish_event(
            TeamCheckpointAdvancedEvent(
                payload=TeamCheckpointAdvancedPayload(
                    team_id=team_id, checkpoint_number=checkpoint.order
                )
            )
        )

    async def derive_staff_scan_status(self, team_obj: Team, checkpoint: CheckPoint) -> str:
        """Where a scanned team stands relative to the staff's checkpoint.

        "checked_in": the post is open to the team, so the scan records it.
        "already_present": the team has already resolved this post.
        "ahead": the team may not be here yet (scanned too early).

        Read from the progress engine, not from ``len(team.times) + 1``. The
        count was only ever the post's order on a strictly sequential route
        with nothing skipped: in free order every unvisited post is open, and
        in a staged route the open set is whatever the stage rules say. The
        arithmetic version called both of those "ahead" and refused to record
        a team standing right in front of the staff member.
        """
        settings = await rally_settings.get_or_create(self._db)
        progress = await progress_for_team(self._db, team_obj, settings)
        if progress.is_resolved(checkpoint.order):
            return "already_present"
        if progress.is_open(checkpoint.order):
            return "checked_in"
        return "ahead"

    async def require_open(self, team_obj: Team, checkpoint: CheckPoint) -> None:
        """Reject a self-check-in at a post the team may not be at yet."""
        settings = await rally_settings.get_or_create(self._db)
        progress = await progress_for_team(self._db, team_obj, settings)
        if progress.is_open(checkpoint.order):
            return
        raise RallyConflictError(unreachable_message(checkpoint, progress))
