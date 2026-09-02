"""GPS geofence arrive endpoint (A2).

Team app posts its current GPS coords; server checks distance vs
checkpoint.arrival_radius_m and records idempotent arrival.
Gated by the ``gps_checkin_enabled`` setting, which is bootstrapped on for
peddy-paper events and off elsewhere.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud import crud_activity
from app.crud.crud_rally_settings import rally_settings
from app.schemas.team_auth import TeamTokenData
from app.services.audit_service import AuditActor, record_audit
from app.services.checkpoint_arrival_service import CheckpointArrivalService
from app.services.deps import get_checkpoint_arrival_service


class ArriveRequest(BaseModel):
    # WGS-84 bounds: an out-of-range fix is a client bug, and Haversine would
    # happily return a plausible-looking distance for it.
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class ArriveResponse(BaseModel):
    team_id: int
    checkpoint_id: int
    distance_m: float
    already_registered: bool
    # True when the checkpoint had no activities and the team was advanced
    # straight past it on check-in (no staff evaluation needed).
    auto_completed: bool = False


class CheckpointArriveController:
    """REST controller for GPS geofence check-in."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/checkpoint/{checkpoint_id}/arrive",
            self.arrive_at_checkpoint,
            methods=["POST"],
            name="arrive_at_checkpoint",
            responses={
                400: {
                    "description": (
                        "GPS check-in unavailable, missing coordinates, too far from the "
                        "checkpoint, or a checkpoint the team is not due at yet"
                    )
                },
                404: {"description": "Checkpoint not found"},
            },
        )

    async def arrive_at_checkpoint(
        self,
        checkpoint_id: int,
        body: ArriveRequest,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        team: Annotated[TeamTokenData, Depends(deps.get_current_team)],
        service: Annotated[CheckpointArrivalService, Depends(get_checkpoint_arrival_service)],
    ) -> ArriveResponse:
        event = await crud_activity.rally_event.get_current(db)
        settings = await rally_settings.get_or_create(db)
        if not event or not settings.gps_checkin_enabled:
            raise HTTPException(
                status_code=400, detail="GPS check-in is not enabled for this event"
            )

        dist, already_registered = await service.record_arrival(
            team_id=team.team_id,
            checkpoint_id=checkpoint_id,
            latitude=body.latitude,
            longitude=body.longitude,
        )
        # No-activity posts complete immediately on arrival; posts with
        # activities wait for staff to submit the result before the team
        # advances. Safe to run on a repeat tap too: auto_complete_if_no_activities
        # now stamps only a still-owed team.times entry (arrivals > visits) and
        # is otherwise a no-op, so a first attempt that failed best-effort can
        # self-heal on the next arrival instead of the visit being lost.
        auto_completed = await service.auto_complete_if_no_activities(
            team.team_id, checkpoint_id
        )
        if not already_registered:
            await record_audit(
                db,
                action="checkin.gps_arrival",
                actor=AuditActor(id=str(team.team_id), name=team.team_name, kind="team"),
                target_type="team",
                target_id=str(team.team_id),
                event_id=event.id,
                note=f"checkpoint_id={checkpoint_id} distance_m={round(dist, 1)}",
            )

        return ArriveResponse(
            team_id=team.team_id,
            checkpoint_id=checkpoint_id,
            distance_m=round(dist, 1),
            already_registered=already_registered,
            auto_completed=auto_completed,
        )


router = CheckpointArriveController().router
