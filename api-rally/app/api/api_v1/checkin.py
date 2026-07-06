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
from app.core.exceptions import RallyForbiddenError, RallyNotFoundError
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.abac_deps import get_staff_with_checkpoint_access
from app.api.auth import AuthData, api_nei_auth
from app.api.api_v1.staff_evaluation_utils import checkin_team_to_checkpoint
from app.api import deps
from app.api.deps import get_current_team, get_db
from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
from app.crud.crud_team import team as team_crud
from app.core.config import Settings, SettingsDep
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

CHECKPOINT_NOT_FOUND = "Checkpoint not found"


class CheckinRequest(BaseModel):
    token: str


class CheckinResponse(BaseModel):
    team_id: int
    checkpoint_id: int
    checkpoint_order: int


def _require_enabled(settings: Settings) -> None:
    if not settings.SELF_CHECKIN_ENABLED:
        raise RallyNotFoundError("Self check-in is disabled")


def _require_same_event(team_event_id: int | None, checkpoint_event_id: int | None) -> None:
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


async def _claim_nonce(nonce: str, team_id: int, settings: Settings) -> bool:
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
    auth: Annotated[AuthData, Depends(api_nei_auth)],
    settings: SettingsDep,
    checkpoint_id: int | None = None,
) -> dict[str, str]:
    """Mint a rotating check-in QR token for a checkpoint.

    Staff get a token for their assigned checkpoint. Admins/managers may pass a
    ``checkpoint_id`` to mint (or preview) the QR for any checkpoint they are
    viewing; staff cannot mint for a checkpoint other than their own.
    """
    _require_enabled(settings)

    is_privileged = deps.is_admin(auth.scopes)  # covers admin + manager-rally
    if checkpoint_id is not None and not is_privileged:
        if checkpoint_id != current_user.staff_checkpoint_id:
            raise RallyForbiddenError("Staff may only mint QR for their own checkpoint")

    target = checkpoint_id if (checkpoint_id is not None and is_privileged) else current_user.staff_checkpoint_id
    if target is None:
        raise RallyForbiddenError("No checkpoint assigned")
    return {"token": generate_checkin_token(target)}


class StaffCheckinRequest(BaseModel):
    """A staff member identifies/checks an arriving team in by its access code."""

    team_code: str
    checkpoint_id: int | None = None


class StaffCheckinResponse(BaseModel):
    """Result of a staff scan: who the team is, plus what happened to arrival.

    The scan's primary job is *identification* — letting staff jump straight to
    the correct team's evaluation without mistakes. Marking arrival is a
    secondary, best-effort side effect, so the team is always returned even when
    arrival was not (re)registered (already here, or scanned too early).
    """

    team_id: int
    team_name: str
    checkpoint_id: int
    checkpoint_order: int
    # "checked_in": arrival was newly registered now.
    # "already_present": team had already reached this post.
    # "ahead": team has not yet reached this post (scanned too early).
    status: str


@router.post("/checkpoint/staff-check-in")
async def staff_check_in(
    body: StaffCheckinRequest,
    current_user: Annotated[
        DetailedUser, Depends(get_staff_with_checkpoint_access)
    ],
    auth: Annotated[AuthData, Depends(api_nei_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: SettingsDep,
) -> StaffCheckinResponse:
    """Staff scans an arriving team's QR (its access code).

    Primary purpose: *identify the team* so staff open the correct evaluation
    fast and without mistakes. Secondary: mark the team's arrival at the staff's
    checkpoint when it is the team's next post. Tolerant by design — a re-scan
    (team already here) or an early scan never errors, so it stays usable
    alongside versus/head-to-head flows; it just reports the arrival ``status``.
    """
    _require_enabled(settings)

    is_privileged = deps.is_admin(auth.scopes)  # covers admin + manager-rally
    checkpoint_id = (
        body.checkpoint_id
        if (body.checkpoint_id is not None and is_privileged)
        else current_user.staff_checkpoint_id
    )
    if checkpoint_id is None:
        raise RallyForbiddenError("No checkpoint assigned")

    code = body.team_code.strip().upper()
    team_obj = await team_crud.get_by_access_code(db, access_code=code)
    if team_obj is None:
        raise RallyNotFoundError("Equipa não encontrada para este código")

    checkpoint = await checkpoint_crud.get(db, id=checkpoint_id)
    if checkpoint is None:
        raise RallyNotFoundError(CHECKPOINT_NOT_FOUND)

    _require_same_event(team_obj.event_id, checkpoint.event_id)

    # times[] holds posts already reached; the next expected post is len + 1.
    reached = len(team_obj.times)
    expected_order = reached + 1

    if checkpoint.order == expected_order:
        await checkin_team_to_checkpoint(db, team_obj.id, checkpoint.id)
        await publish_event(
            TeamCheckpointAdvancedEvent(
                payload=TeamCheckpointAdvancedPayload(
                    team_id=team_obj.id, checkpoint_number=checkpoint.order
                )
            )
        )
        arrival_status = "checked_in"
    elif checkpoint.order <= reached:
        arrival_status = "already_present"
    else:
        arrival_status = "ahead"

    return StaffCheckinResponse(
        team_id=team_obj.id,
        team_name=team_obj.name,
        checkpoint_id=checkpoint.id,
        checkpoint_order=checkpoint.order,
        status=arrival_status,
    )


@router.post("/checkpoint/check-in")
async def check_in(
    body: CheckinRequest,
    *,
    team: Annotated[TeamTokenData, Depends(get_current_team)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: SettingsDep,
) -> CheckinResponse:
    """Check the calling team into the checkpoint encoded in the scanned token."""
    _require_enabled(settings)

    try:
        claims = verify_checkin_token(body.token)
    except CheckinTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    if not await _claim_nonce(claims.nonce, team.team_id, settings):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This QR was already used by your team",
        )

    checkpoint = await checkpoint_crud.get(db, id=claims.checkpoint_id)
    if checkpoint is None:
        raise RallyNotFoundError(CHECKPOINT_NOT_FOUND)

    team_obj = await team_crud.get(db, id=team.team_id)
    if team_obj is None:
        raise RallyNotFoundError("Team not found")

    _require_same_event(team_obj.event_id, checkpoint.event_id)

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
