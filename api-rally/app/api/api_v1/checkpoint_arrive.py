"""GPS geofence arrive endpoint (A2).

Team app posts its current GPS coords; server checks distance vs
checkpoint.arrival_radius_m and records idempotent arrival.
Only available when the current event is PEDDY_PAPER.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud import crud_activity
from app.models.activity import EventType
from app.models.checkpoint_arrival import CheckpointArrival
from app.schemas.team_auth import TeamTokenData
from app.utils.geo import distance_m
from app import crud

router = APIRouter()


class ArriveRequest(BaseModel):
    latitude: float
    longitude: float


class ArriveResponse(BaseModel):
    team_id: int
    checkpoint_id: int
    distance_m: float
    already_registered: bool


@router.post("/checkpoint/{checkpoint_id}/arrive", response_model=ArriveResponse)
async def arrive_at_checkpoint(
    checkpoint_id: int,
    body: ArriveRequest,
    db: AsyncSession = Depends(deps.get_db),
    team: TeamTokenData = Depends(deps.get_current_team),
) -> ArriveResponse:
    event = await crud_activity.rally_event.get_current(db)
    if not event or event.event_type != EventType.PEDDY_PAPER.value:
        raise HTTPException(status_code=400, detail="GPS check-in only available for Peddy Paper events")

    checkpoint = await crud.checkpoint.get(db=db, id=checkpoint_id)
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    if checkpoint.latitude is None or checkpoint.longitude is None:
        raise HTTPException(status_code=400, detail="Checkpoint has no GPS coordinates")

    dist = distance_m(body.latitude, body.longitude, checkpoint.latitude, checkpoint.longitude)

    if dist > checkpoint.arrival_radius_m:
        raise HTTPException(
            status_code=400,
            detail=f"Too far from checkpoint: {dist:.0f}m (max {checkpoint.arrival_radius_m}m)",
        )

    # Check if already registered (idempotent)
    existing = await db.execute(
        select(CheckpointArrival).where(
            CheckpointArrival.team_id == team.team_id,
            CheckpointArrival.checkpoint_id == checkpoint_id,
        )
    )
    if existing.scalars().first():
        return ArriveResponse(
            team_id=team.team_id,
            checkpoint_id=checkpoint_id,
            distance_m=round(dist, 1),
            already_registered=True,
        )

    arrival = CheckpointArrival(
        team_id=team.team_id,
        checkpoint_id=checkpoint_id,
        latitude=body.latitude,
        longitude=body.longitude,
    )
    db.add(arrival)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return ArriveResponse(
            team_id=team.team_id,
            checkpoint_id=checkpoint_id,
            distance_m=round(dist, 1),
            already_registered=True,
        )

    return ArriveResponse(
        team_id=team.team_id,
        checkpoint_id=checkpoint_id,
        distance_m=round(dist, 1),
        already_registered=False,
    )
