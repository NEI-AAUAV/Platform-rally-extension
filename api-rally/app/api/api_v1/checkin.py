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

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.abac_deps import get_staff_with_checkpoint_access
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_current_team, get_db
from app.core.config import Settings, SettingsDep
from app.core.exceptions import (
    RallyConflictError,
    RallyForbiddenError,
    RallyNotFoundError,
    RallyValidationError,
)
from app.crud.crud_team import CRUDTeam
from app.crud.deps import get_team_crud
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.audit_service import AuditActor, record_audit
from app.services.checkin_service import CheckinService
from app.services.checkin_token import (
    CheckinTokenError,
    generate_checkin_token,
    verify_checkin_token,
)
from app.services.deps import get_checkin_service
from app.services.event_scope import require_same_event


class CheckinRequest(BaseModel):
    token: str


class CheckinResponse(BaseModel):
    team_id: int
    checkpoint_id: int
    checkpoint_order: int


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


class CheckinController:
    """REST controller for team QR self-check-in and staff scans."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/checkpoint/checkin-token",
            self.get_checkin_token,
            methods=["GET"],
            name="get_checkin_token",
        )
        self.router.add_api_route(
            "/checkpoint/staff-check-in",
            self.staff_check_in,
            methods=["POST"],
            name="staff_check_in",
        )
        self.router.add_api_route(
            "/checkpoint/check-in", self.check_in, methods=["POST"], name="check_in"
        )

    def _require_enabled(self, settings: Settings) -> None:
        if not settings.SELF_CHECKIN_ENABLED:
            raise RallyNotFoundError("Self check-in is disabled")

    def get_checkin_token(
        self,
        current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        settings: SettingsDep,
        checkpoint_id: int | None = None,
    ) -> dict[str, str]:
        """Mint a rotating check-in QR token for a checkpoint.

        Staff get a token for their assigned checkpoint. Admins/managers may pass a
        ``checkpoint_id`` to mint (or preview) the QR for any checkpoint they are
        viewing; staff cannot mint for a checkpoint other than their own.
        """
        self._require_enabled(settings)

        is_privileged = deps.is_admin_or_manager(auth.scopes)  # covers admin + manager-rally
        if (
            checkpoint_id is not None
            and not is_privileged
            and checkpoint_id != current_user.staff_checkpoint_id
        ):
            raise RallyForbiddenError("Staff may only mint QR for their own checkpoint")

        target = (
            checkpoint_id
            if (checkpoint_id is not None and is_privileged)
            else current_user.staff_checkpoint_id
        )
        if target is None:
            raise RallyForbiddenError("No checkpoint assigned")
        return {"token": generate_checkin_token(target)}

    async def staff_check_in(
        self,
        body: StaffCheckinRequest,
        current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        db: Annotated[AsyncSession, Depends(get_db)],
        service: Annotated[CheckinService, Depends(get_checkin_service)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
    ) -> StaffCheckinResponse:
        """Staff scans an arriving team's QR (its access code).

        Primary purpose: *identify the team* so staff open the correct evaluation
        fast and without mistakes. Secondary: mark the team's arrival at the staff's
        checkpoint when it is the team's next post. Tolerant by design — a re-scan
        (team already here) or an early scan never errors, so it stays usable
        alongside versus/head-to-head flows; it just reports the arrival ``status``.

        Not gated by ``SELF_CHECKIN_ENABLED``: that flag governs teams scanning a
        checkpoint's QR to advance themselves. A staff member scanning a team to
        identify it and open the right evaluation is the normal staffed flow and
        must work whether or not self check-in is enabled.
        """
        is_privileged = deps.is_admin_or_manager(auth.scopes)  # covers admin + manager-rally
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

        checkpoint = await service.get_checkpoint_or_raise(checkpoint_id)
        require_same_event(team_obj.event_id, checkpoint.event_id)

        arrival_status = await service.derive_staff_scan_status(team_obj, checkpoint)
        if arrival_status == "checked_in":
            await service.check_in_and_publish(team_obj.id, checkpoint)
            await record_audit(
                db,
                action="checkin.staff_scan",
                actor=AuditActor(id=str(current_user.id), name=current_user.name, kind="staff"),
                target_type="team",
                target_id=str(team_obj.id),
                event_id=checkpoint.event_id,
                note=f"checkpoint_id={checkpoint.id} checkpoint_order={checkpoint.order}",
            )

        return StaffCheckinResponse(
            team_id=team_obj.id,
            team_name=team_obj.name,
            checkpoint_id=checkpoint.id,
            checkpoint_order=checkpoint.order,
            status=arrival_status,
        )

    async def check_in(
        self,
        body: CheckinRequest,
        *,
        team: Annotated[TeamTokenData, Depends(get_current_team)],
        db: Annotated[AsyncSession, Depends(get_db)],
        settings: SettingsDep,
        service: Annotated[CheckinService, Depends(get_checkin_service)],
    ) -> CheckinResponse:
        """Check the calling team into the checkpoint encoded in the scanned token."""
        self._require_enabled(settings)

        try:
            claims = verify_checkin_token(body.token)
        except CheckinTokenError as exc:
            raise RallyValidationError(str(exc)) from exc

        if not await service.claim_nonce(claims.nonce, team.team_id, settings):
            raise RallyConflictError("This QR was already used by your team")

        checkpoint = await service.get_checkpoint_or_raise(claims.checkpoint_id)
        team_obj = await service.get_team_or_raise(team.team_id)
        require_same_event(team_obj.event_id, checkpoint.event_id)

        # A team may only check into a post the route currently leaves open to
        # it. That is the engine's answer, not ``len(times) + 1``: the count is
        # the post's order only on a strictly sequential route, and this same
        # scan is legitimate at any unvisited post in free order, or at any
        # post the current stage allows.
        await service.require_open(team_obj, checkpoint)

        await service.check_in_and_publish(team.team_id, checkpoint)
        await record_audit(
            db,
            action="checkin.self_checkin",
            actor=AuditActor(id=str(team.team_id), name=team.team_name, kind="team"),
            target_type="team",
            target_id=str(team.team_id),
            event_id=checkpoint.event_id,
            note=f"checkpoint_id={checkpoint.id} checkpoint_order={checkpoint.order}",
        )

        return CheckinResponse(
            team_id=team.team_id,
            checkpoint_id=checkpoint.id,
            checkpoint_order=checkpoint.order,
        )


router = CheckinController().router
