"""Rally guide endpoints (C1).

A rally-guide user can view checkpoint details including their media gallery
(photos/videos uploaded by admins). This gives tour guides a read-only view
of the checkpoints they're accompanying teams through.

Guides, staff, admins, and managers all have access. Public users do not.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Security
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_guide
from app.core.exceptions import RallyForbiddenError
from app.schemas.user import DetailedUser
from app.services.audit_service import AuditActor, record_audit
from app.services.checkpoint_arrival_service import CheckpointArrivalService
from app.services.deps import get_checkpoint_arrival_service, get_guide_service
from app.services.guide_service import GuideService


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
    latitude: float | None = None
    longitude: float | None = None
    media: list[GuideMediaItem]
    indications: list[GuideIndicationItem]

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
            responses={403: {"description": "Not this guide's checkpoint"}},
        )
        self.router.add_api_route(
            "/guide/checkpoints/{checkpoint_id}/arrivals",
            self.record_guide_arrival,
            methods=["POST"],
            status_code=201,
            name="record_guide_arrival",
            responses={
                400: {"description": "Outside the event window, or a cross-edition team"},
                403: {"description": "Not this guide's checkpoint"},
                404: {"description": "Checkpoint not found"},
            },
        )

    async def list_guide_checkpoints(
        self,
        curr_user: Annotated[DetailedUser, Depends(get_guide)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[GuideService, Depends(get_guide_service)],
    ) -> list[GuideCheckpointResponse]:
        """Checkpoints with their media gallery for the current event.

        Scoped to the guide's own assignment (see GuideService); staff and
        admins get the whole route. Ordered by checkpoint order.
        """
        checkpoints = await service.list_checkpoints_with_gallery(
            user_id=curr_user.id,
            is_privileged=deps.is_admin_or_staff(auth.scopes),
        )

        return [
            GuideCheckpointResponse(
                id=cp.id,
                name=cp.name,
                order=cp.order,
                description=cp.description,
                clue=cp.clue,
                clue_media_url=cp.clue_media_url,
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
        await self._require_checkpoint_access(guide_service, curr_user, auth, checkpoint_id)

        created = await arrival_service.record_manual_arrival(
            team_id=body.team_id, checkpoint_id=checkpoint_id
        )
        # Same follow-up as the GPS path: a post with no activities completes
        # on arrival, one with activities waits for the staff evaluation.
        auto_completed = await arrival_service.auto_complete_if_no_activities(
            body.team_id, checkpoint_id
        )
        if created:
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
            is_privileged=deps.is_admin_or_staff(auth.scopes),
        )
        if not allowed:
            raise RallyForbiddenError("Not assigned to this checkpoint")


router = GuideController().router
