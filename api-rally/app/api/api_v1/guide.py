"""Rally guide endpoints (C1).

A rally-guide user can view checkpoint details including their media gallery
(photos/videos uploaded by admins). This gives tour guides a read-only view
of the checkpoints they're accompanying teams through.

Guides, staff, admins, and managers can all reach these routes, but only an
admin or manager is treated as privileged here: a plain ``rally-staff`` user
is scoped like a guide and must actually be assigned before writing progress.
Every route is gated on guide mode being enabled *and* active.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Security
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_guide
from app.core.exceptions import RallyForbiddenError, RallyNotFoundError, RallyValidationError
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import CRUDTeam
from app.crud.deps import get_team_crud
from app.schemas.team import PrivilegedDetailedTeam
from app.schemas.user import DetailedUser
from app.services.audit_service import AuditActor, record_audit
from app.services.checkpoint_arrival_service import CheckpointArrivalService
from app.services.deps import get_checkpoint_arrival_service, get_guide_service, get_team_service
from app.services.guide_service import GuideService
from app.services.team_service import TeamService


class GuideMediaItem(BaseModel):
    id: int
    kind: str
    url: str | None = None
    caption: str | None = None
    display_order: int

    model_config = {"from_attributes": True}


class GuideIndicationItem(BaseModel):
    id: int
    hint: str
    question: str | None = None
    expected_answer: str | None = None
    order: int

    model_config = {"from_attributes": True}


class GuideTeamAtCheckpoint(BaseModel):
    team_id: int
    team_name: str
    arrived_at: datetime
    # True when a guide vouched for the arrival instead of a GPS fix.
    arrived_by_guide: bool
    # Which of this checkpoint's indications the team already paid to unlock,
    # so the guide does not read out a hint they just bought.
    revealed_indication_ids: list[int]


class GuideArrivalRequest(BaseModel):
    team_id: int


class GuideArrivalResponse(BaseModel):
    team_id: int
    checkpoint_id: int
    already_registered: bool
    auto_completed: bool


class GuideCheckpointResponse(BaseModel):
    id: int
    name: str
    order: int
    description: str | None = None
    # The riddle the team was given for this post. A guide cannot help a stuck
    # team without knowing what they were told to solve, and unlike the team's
    # own view there is nothing to redact here — the guide is standing at the
    # answer.
    clue: str | None = None
    clue_media_url: str | None = None
    # What whoever is stationed here should talk about, and the challenge as it
    # was planned. This is the audience the two columns were written for; the
    # participant schema does not carry them at all.
    staff_script: str | None = None
    challenge_brief: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    media: list[GuideMediaItem]
    indications: list[GuideIndicationItem]
    # True for the one post the guide's assigned team currently needs.
    # Always False for a privileged caller (no single "current" post) or a
    # guide with no team assigned. The client highlights this one;
    # arrival-marking is still enforced server-side regardless of this flag.
    is_current: bool = False

    model_config = {"from_attributes": True}


class GuideController:
    """REST controller for rally guide read-only checkpoint views."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/guide/checkpoints",
            self.list_guide_checkpoints,
            methods=["GET"],
            name="list_guide_checkpoints",
            responses={403: {"description": "Guide mode is not active for this event"}},
        )
        self.router.add_api_route(
            "/guide/checkpoints/{checkpoint_id}/teams",
            self.list_teams_at_checkpoint,
            methods=["GET"],
            name="list_guide_teams_at_checkpoint",
            responses={403: {"description": "Guide mode is off, or not this guide's checkpoint"}},
        )
        self.router.add_api_route(
            "/guide/checkpoints/{checkpoint_id}/arrivals",
            self.record_guide_arrival,
            methods=["POST"],
            status_code=201,
            name="record_guide_arrival",
            responses={
                400: {"description": "Outside the event window, or a cross-edition team"},
                403: {
                    "description": (
                        "Guide mode is off, not this guide's checkpoint, or not this guide's team"
                    )
                },
                404: {"description": "Checkpoint not found"},
            },
        )
        self.router.add_api_route(
            "/guide/team",
            self.get_guide_team,
            methods=["GET"],
            name="get_guide_team",
            responses={
                403: {"description": "Guide mode is not active for this event"},
                404: {"description": "No team assigned to this guide"},
            },
        )

    async def list_guide_checkpoints(
        self,
        curr_user: Annotated[DetailedUser, Depends(get_guide)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[GuideService, Depends(get_guide_service)],
    ) -> list[GuideCheckpointResponse]:
        """Checkpoints with their media gallery for the current event.

        Every post is returned — a guide accompanies their team through the
        whole route rather than being fixed to one — with the team's current
        post flagged via ``is_current`` for the client to highlight. Ordered
        by checkpoint order.
        """
        await service.require_guide_mode()
        checkpoints, current_id = await service.list_checkpoints_with_gallery(
            user_id=curr_user.id,
            is_privileged=deps.is_admin_or_manager(auth.scopes),
        )

        return [
            GuideCheckpointResponse(
                id=cp.id,
                name=cp.name,
                order=cp.order,
                description=cp.description,
                clue=cp.clue,
                clue_media_url=cp.clue_media_url,
                staff_script=cp.staff_script,
                challenge_brief=cp.challenge_brief,
                latitude=cp.latitude,
                longitude=cp.longitude,
                media=[
                    GuideMediaItem(
                        id=m.id,
                        kind=m.kind.value if hasattr(m.kind, "value") else m.kind,
                        url=m.image_url,
                        caption=m.caption,
                        display_order=m.order,
                    )
                    for m in sorted(cp.media, key=lambda m: m.order)
                ],
                indications=[
                    GuideIndicationItem(
                        id=i.id,
                        hint=i.hint,
                        question=i.question,
                        expected_answer=i.expected_answer,
                        order=i.order,
                    )
                    for i in sorted(cp.guide_indications, key=lambda i: i.order)
                ],
                is_current=cp.id == current_id,
            )
            for cp in checkpoints
        ]

    async def list_teams_at_checkpoint(
        self,
        checkpoint_id: int,
        curr_user: Annotated[DetailedUser, Depends(get_guide)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[GuideService, Depends(get_guide_service)],
    ) -> list[GuideTeamAtCheckpoint]:
        """Teams that have arrived at this post, and the hints they bought."""
        await service.require_guide_mode()
        await self._require_checkpoint_access(service, curr_user, auth, checkpoint_id)
        rows = await service.teams_at_checkpoint(checkpoint_id)
        return [GuideTeamAtCheckpoint(**row) for row in rows]

    async def record_guide_arrival(
        self,
        checkpoint_id: int,
        body: GuideArrivalRequest,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(get_guide)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        guide_service: Annotated[GuideService, Depends(get_guide_service)],
        arrival_service: Annotated[
            CheckpointArrivalService, Depends(get_checkpoint_arrival_service)
        ],
    ) -> GuideArrivalResponse:
        """Mark a team as arrived, on the guide's word instead of a GPS fix.

        GPS check-in fails for ordinary reasons — a flat battery, no signal, an
        indoor post — and the guide is standing there watching the team. This
        is the fallback, and it is audited like every other progress write.
        """
        await guide_service.require_guide_mode()
        await self._require_checkpoint_access(guide_service, curr_user, auth, checkpoint_id)

        if not deps.is_admin_or_manager(auth.scopes):
            assigned_team_id = await guide_service.assigned_team_id(curr_user.id)
            if assigned_team_id != body.team_id:
                raise RallyForbiddenError("Not this guide's team")

        settings = await rally_settings.get_or_create(db)
        if not getattr(settings, "guide_manual_arrival_enabled", True):
            raise RallyValidationError("Guide-recorded arrivals are not enabled for this event")

        created = await arrival_service.record_manual_arrival(
            team_id=body.team_id, checkpoint_id=checkpoint_id
        )
        # Same follow-up as the GPS path, and same reason it is gated on
        # ``created``: re-running it on a repeat call appended another visit
        # and advanced the team a post it had not been to.
        auto_completed = False
        if created:
            auto_completed = await arrival_service.auto_complete_if_no_activities(
                body.team_id, checkpoint_id
            )
            await record_audit(
                db,
                action="checkin.guide_arrival",
                actor=AuditActor(id=str(curr_user.id), name=curr_user.name, kind="user"),
                target_type="team",
                target_id=str(body.team_id),
                note=f"checkpoint_id={checkpoint_id} (no GPS: vouched for by guide)",
            )

        return GuideArrivalResponse(
            team_id=body.team_id,
            checkpoint_id=checkpoint_id,
            already_registered=not created,
            auto_completed=auto_completed,
        )

    async def get_guide_team(
        self,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(get_guide)],
        guide_service: Annotated[GuideService, Depends(get_guide_service)],
        team_service: Annotated[TeamService, Depends(get_team_service)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
    ) -> PrivilegedDetailedTeam:
        """The guide's own assigned team — name, members, and access-code QR.

        Scoped to the single team this guide is assigned to; a guide never
        sees another team's roster or access code through this endpoint.
        """
        await guide_service.require_guide_mode()
        team_id = await guide_service.assigned_team_id(curr_user.id)
        if team_id is None:
            raise RallyNotFoundError("No team assigned to this guide")

        team_obj = await team_crud.get(db=db, id=team_id)
        if team_obj is None:
            raise RallyNotFoundError("Assigned team not found")

        return await team_service.build_detailed_team(
            team_obj, with_progress=True, with_access_code=True
        )

    @staticmethod
    async def _require_checkpoint_access(
        service: GuideService,
        curr_user: DetailedUser,
        auth: AuthData,
        checkpoint_id: int,
    ) -> None:
        allowed = await service.can_manage_checkpoint(
            user_id=curr_user.id,
            checkpoint_id=checkpoint_id,
            is_privileged=deps.is_admin_or_manager(auth.scopes),
        )
        if not allowed:
            raise RallyForbiddenError("Not assigned to this checkpoint")


router = GuideController().router
