"""Business rules for team QR self-check-in: feature gating, cross-event
guards, replay protection, and staff-scan status derivation.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.api_v1.staff_evaluation_utils import checkin_team_to_checkpoint
from app.core.config import Settings
from app.core.exceptions import RallyNotFoundError
from app.core.redis import get_async_redis_client
from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
from app.crud.crud_team import team as team_crud
from app.events import TeamCheckpointAdvancedEvent, TeamCheckpointAdvancedPayload, publish_event
from app.models.checkpoint import CheckPoint
from app.models.team import Team

logger = logging.getLogger(__name__)

CHECKPOINT_NOT_FOUND = "Checkpoint not found"


def require_same_event(team_event_id: int | None, checkpoint_event_id: int | None) -> None:
    """Reject cross-event check-ins.

    A valid token/scan for a checkpoint of another edition must not advance a
    team in this one. NULL event ids (legacy rows) are treated as compatible.
    """
    if (
        team_event_id is not None
        and checkpoint_event_id is not None
        and team_event_id != checkpoint_event_id
    ):
        raise RallyNotFoundError(CHECKPOINT_NOT_FOUND)


class CheckinService:
    """Team QR self-check-in and staff-scan identification lifecycle."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

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
        checkpoint = await checkpoint_crud.get(self._db, id=checkpoint_id)
        if checkpoint is None:
            raise RallyNotFoundError(CHECKPOINT_NOT_FOUND)
        return checkpoint

    async def get_team_or_raise(self, team_id: int) -> Team:
        team_obj = await team_crud.get(self._db, id=team_id)
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

    @staticmethod
    def derive_staff_scan_status(*, checkpoint_order: int, times_reached: int) -> str:
        """Where a scanned team stands relative to the staff's checkpoint.

        "checked_in": arrival was newly registered now.
        "already_present": team had already reached this post.
        "ahead": team has not yet reached this post (scanned too early).
        """
        expected_order = times_reached + 1
        if checkpoint_order == expected_order:
            return "checked_in"
        if checkpoint_order <= times_reached:
            return "already_present"
        return "ahead"
