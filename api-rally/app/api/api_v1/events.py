"""Event (edition) management endpoints.

An event scopes teams, checkpoints, activities and settings. Exactly one event
is "current"; public reads resolve to it. Admins/managers can create new
editions and switch the current one without wiping the database.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.core.exceptions import RallyNotFoundError
from app.api.auth import AuthData, api_nei_auth
from fastapi import HTTPException
from pydantic import BaseModel
from app.api.deps import get_admin, get_db
from app.schemas.activity import (
    RallyEventCreate,
    RallyEventResponse,
    RallyEventUpdate,
)
from app.schemas.user import DetailedUser
from app.utils.round_robin import generate_schedule

router = APIRouter()


@router.get("/events", response_model=list[RallyEventResponse], tags=["Events"])
async def list_events(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
) -> list[RallyEventResponse]:
    """List events (newest first). Public — drives the homepage event selector."""
    events = await crud.rally_event.get_multi(db, skip=skip, limit=limit)
    return [RallyEventResponse.model_validate(e) for e in events]


@router.get("/events/current", response_model=RallyEventResponse, tags=["Events"])
async def get_current_event(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RallyEventResponse:
    """Return the current event (bootstrapping a default one if none exists)."""
    event = await crud.rally_event.ensure_current(db)
    return RallyEventResponse.model_validate(event)


@router.get("/events/{event_id}", response_model=RallyEventResponse, tags=["Events"])
async def get_event(
    event_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RallyEventResponse:
    event = await crud.rally_event.get(db, event_id)
    if event is None:
        raise RallyNotFoundError("Event not found")
    return RallyEventResponse.model_validate(event)


@router.post("/events", response_model=RallyEventResponse, status_code=201, tags=["Events"])
async def create_event(
    event_in: RallyEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[DetailedUser, Depends(get_admin)],
    _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RallyEventResponse:
    """Create a new event edition (admin/manager only)."""
    event = await crud.rally_event.create(db, obj_in=event_in)
    return RallyEventResponse.model_validate(event)


@router.put("/events/{event_id}", response_model=RallyEventResponse, tags=["Events"])
async def update_event(
    event_id: int,
    event_in: RallyEventUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[DetailedUser, Depends(get_admin)],
    _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RallyEventResponse:
    event = await crud.rally_event.get(db, event_id)
    if event is None:
        raise RallyNotFoundError("Event not found")
    updated = await crud.rally_event.update(db, db_obj=event, obj_in=event_in)
    return RallyEventResponse.model_validate(updated)


@router.post("/events/{event_id}/set-current", response_model=RallyEventResponse, tags=["Events"])
async def set_current_event(
    event_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[DetailedUser, Depends(get_admin)],
    _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RallyEventResponse:
    """Make the given event the sole current edition (admin/manager only)."""
    event = await crud.rally_event.set_current(db, event_id=event_id)
    if event is None:
        raise RallyNotFoundError("Event not found")
    return RallyEventResponse.model_validate(event)


class RotationScheduleResponse(BaseModel):
    event_id: int
    rounds: list[list[dict]]


@router.post(
    "/events/{event_id}/rotation-schedule",
    response_model=RotationScheduleResponse,
    tags=["Events"],
)
async def generate_rotation_schedule(
    event_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[DetailedUser, Depends(get_admin)],
    _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RotationScheduleResponse:
    """Generate and persist a round-robin rotation schedule for an Olympic event.

    Reads the event's current teams and checkpoints, runs the generator, and
    stores the result in RallyEvent.rotation_schedule. Returns the schedule.
    """
    from sqlalchemy import select
    from app.models.activity import EventType
    from app.models.team import Team
    from app.models.checkpoint import CheckPoint

    event = await crud.rally_event.get(db, event_id)
    if event is None:
        raise RallyNotFoundError("Event not found")
    if event.event_type != EventType.OLYMPIC.value:
        raise HTTPException(status_code=400, detail="Rotation schedule only available for Olympic events")

    teams = list((await db.scalars(
        select(Team).where(Team.event_id == event_id, Team.is_active.is_(True))
    )).all())
    checkpoints = list((await db.scalars(
        select(CheckPoint).where(CheckPoint.event_id == event_id)
    )).all())

    if not teams or not checkpoints:
        raise HTTPException(status_code=400, detail="Event has no teams or checkpoints")

    team_ids = [t.id for t in teams]
    checkpoint_ids = [c.id for c in checkpoints]
    schedule = generate_schedule(team_ids, checkpoint_ids)

    event.rotation_schedule = schedule
    await db.commit()

    return RotationScheduleResponse(event_id=event_id, rounds=schedule)
