"""Team QR self-check-in.

A checkpoint displays a short-lived, HMAC-signed QR (the GET below mints it for
the staff member's own checkpoint). A team scans it and POSTs the token to
check itself into that checkpoint, which appends the visit and advances the
team — replacing staff gating for rallies that opt in via SELF_CHECKIN_ENABLED.

Anti-fraud layers, in order of importance:
1. The token expires (CHECKIN_TOKEN_TTL_SECONDS), so a screenshot goes stale.
2. Check-ins must be sequential: a team can only scan its next checkpoint, so a
   token cannot skip ahead or be replayed to advance twice.
3. A best-effort per-(token, team) Redis guard rejects a double-submit race.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.abac_deps import get_staff_with_checkpoint_access
from app.api.api_v1.staff_evaluation_utils import checkin_team_to_checkpoint
from app.api.deps import get_current_team, get_db
from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
from app.crud.crud_team import team as team_crud
from app.core.config import settings
from app.core.redis import get_async_redis_client
from app.events import (
    TeamCheckpointAdvancedEvent,
    TeamCheckpointAdvancedPayload,
    publish_event,
)
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.checkin_token import (
    CheckinTokenError,
    generate_checkin_token,
    verify_checkin_token,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class CheckinRequest(BaseModel):
    token: str


class CheckinResponse(BaseModel):
    team_id: int
    checkpoint_id: int
    checkpoint_order: int


def _require_enabled() -> None:
    if not settings.SELF_CHECKIN_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Self check-in is disabled",
        )


async def _claim_nonce(nonce: str, team_id: int) -> bool:
    """Best-effort single-use guard for one (token, team) pair.

    Returns True when the claim is fresh, False when already claimed. Fails open
    (returns True) if Redis is unavailable — sequential ordering remains the
    authoritative guard, so a transient Redis outage never blocks legit teams.
    """
    key = f"rally:checkin:{nonce}:{team_id}"
    client = get_async_redis_client()
    try:
        was_set = await client.set(
            key, "1", nx=True, ex=settings.CHECKIN_TOKEN_TTL_SECONDS
        )
        return bool(was_set)
    except Exception as exc:  # noqa: BLE001 — replay guard is best-effort
        logger.warning("Check-in replay guard unavailable: %s", exc)
        return True
    finally:
        await client.aclose()


@router.get("/checkpoint/checkin-token")
async def get_checkin_token(
    current_user: Annotated[
        DetailedUser, Depends(get_staff_with_checkpoint_access)
    ],
) -> dict[str, str]:
    """Mint a rotating check-in QR token for the staff member's checkpoint."""
    _require_enabled()
    checkpoint_id = current_user.staff_checkpoint_id
    if checkpoint_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No checkpoint assigned",
        )
    return {"token": generate_checkin_token(checkpoint_id)}


@router.post("/checkpoint/check-in", response_model=CheckinResponse)
async def check_in(
    body: CheckinRequest,
    *,
    team: Annotated[TeamTokenData, Depends(get_current_team)],
    db: AsyncSession = Depends(get_db),
) -> CheckinResponse:
    """Check the calling team into the checkpoint encoded in the scanned token."""
    _require_enabled()

    try:
        claims = verify_checkin_token(body.token)
    except CheckinTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    if not await _claim_nonce(claims.nonce, team.team_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This QR was already used by your team",
        )

    checkpoint = await checkpoint_crud.get(db, id=claims.checkpoint_id)
    if checkpoint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Checkpoint not found"
        )

    team_obj = await team_crud.get(db, id=team.team_id)
    if team_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team not found"
        )

    # Sequential guard: a team may only check into its next checkpoint. times[]
    # holds the checkpoints already visited, so the next expected order is
    # len(times) + 1. Anything else is out of order (skip ahead or repeat).
    expected_order = len(team_obj.times) + 1
    if checkpoint.order != expected_order:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Out-of-order check-in: expected checkpoint {expected_order}, "
                f"scanned {checkpoint.order}"
            ),
        )

    await checkin_team_to_checkpoint(db, team.team_id, checkpoint.id)

    await publish_event(
        TeamCheckpointAdvancedEvent(
            payload=TeamCheckpointAdvancedPayload(
                team_id=team.team_id, checkpoint_number=checkpoint.order
            )
        )
    )

    return CheckinResponse(
        team_id=team.team_id,
        checkpoint_id=checkpoint.id,
        checkpoint_order=checkpoint.order,
    )
