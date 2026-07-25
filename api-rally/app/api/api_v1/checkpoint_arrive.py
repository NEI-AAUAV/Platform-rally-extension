"""GPS geofence arrive endpoint (A2).

Team app posts its current GPS coords; server checks distance vs
checkpoint.arrival_radius_m and records idempotent arrival.
Only available when the current event is PEDDY_PAPER.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud import crud_activity
from app.models.activity import EventType
from app.schemas.team_auth import TeamTokenData
from app.services.checkpoint_arrival_service import CheckpointArrivalService

router = APIRouter()


class ArriveRequest(BaseModel):
    latitude: float
    longitude: float


class ArriveResponse(BaseModel):
    team_id: int
    checkpoint_id: int
    distance_m: float
    already_registered: bool
    # True when the checkpoint had no activities and the team was advanced
    # straight past it on check-in (no staff evaluation needed).
    auto_completed: bool = False


@router.post(
    "/checkpoint/{checkpoint_id}/arrive",
    responses={
        400: {
            "description": "GPS check-in unavailable, missing coordinates, or too far from checkpoint"
        },
        404: {"description": "Checkpoint not found"},
    },
)
async def arrive_at_checkpoint(
    checkpoint_id: int,
    body: ArriveRequest,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    team: Annotated[TeamTokenData, Depends(deps.get_current_team)],
) -> ArriveResponse:
    event = await crud_activity.rally_event.get_current(db)
    if not event or event.event_type != EventType.PEDDY_PAPER.value:
        raise HTTPException(
            status_code=400, detail="GPS check-in only available for Peddy Paper events"
        )

    service = CheckpointArrivalService(db)
    dist, already_registered = await service.record_arrival(
        team_id=team.team_id,
        checkpoint_id=checkpoint_id,
        latitude=body.latitude,
        longitude=body.longitude,
    )

    # No-activity posts complete immediately on arrival; posts with activities
    # wait for staff to submit the result before the team advances. Run this on
    # every check-in (including repeats): the order guard inside makes it a
    # no-op once the team has already advanced, so a team that arrived before
    # this behaviour existed still gets unstuck on their next check-in.
    auto_completed = await service.auto_complete_if_no_activities(team.team_id, checkpoint_id)

    return ArriveResponse(
        team_id=team.team_id,
        checkpoint_id=checkpoint_id,
        distance_m=round(dist, 1),
        already_registered=already_registered,
        auto_completed=auto_completed,
    )
