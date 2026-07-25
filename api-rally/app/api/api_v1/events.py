"""Event (edition) management endpoints.

An event scopes teams, checkpoints, activities and settings. Exactly one event
is "current"; public reads resolve to it. Admins/managers can create new
editions and switch the current one without wiping the database.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Security
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_admin, get_db
from app.core.exceptions import RallyNotFoundError
from app.schemas.activity import (
    RallyEventCreate,
    RallyEventResponse,
    RallyEventUpdate,
)
from app.schemas.user import DetailedUser
from app.services.event_service import EVENT_NOT_FOUND, EventService

router = APIRouter()

EVENT_NOT_FOUND_RESPONSES: dict[int | str, dict[str, Any]] = {404: {"description": EVENT_NOT_FOUND}}


@router.get("/events", tags=["Events"])
async def list_events(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
) -> list[RallyEventResponse]:
    """List events (newest first). Public — drives the homepage event selector."""
    events = await crud.rally_event.get_multi(db, skip=skip, limit=limit)
    return [RallyEventResponse.model_validate(e) for e in events]


@router.get("/events/current", tags=["Events"])
async def get_current_event(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RallyEventResponse:
    """Return the current event (bootstrapping a default one if none exists)."""
    event = await crud.rally_event.ensure_current(db)
    return RallyEventResponse.model_validate(event)


@router.get("/events/{event_id}", tags=["Events"], responses=EVENT_NOT_FOUND_RESPONSES)
async def get_event(
    event_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RallyEventResponse:
    event = await crud.rally_event.get(db, event_id)
    if event is None:
        raise RallyNotFoundError(EVENT_NOT_FOUND)
    return RallyEventResponse.model_validate(event)


@router.post("/events", status_code=201, tags=["Events"])
async def create_event(
    event_in: RallyEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[DetailedUser, Depends(get_admin)],
    _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RallyEventResponse:
    """Create a new event edition (admin/manager only)."""
    event = await crud.rally_event.create(db, obj_in=event_in)
    return RallyEventResponse.model_validate(event)


@router.put("/events/{event_id}", tags=["Events"], responses=EVENT_NOT_FOUND_RESPONSES)
async def update_event(
    event_id: int,
    event_in: RallyEventUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[DetailedUser, Depends(get_admin)],
    _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RallyEventResponse:
    event = await crud.rally_event.get(db, event_id)
    if event is None:
        raise RallyNotFoundError(EVENT_NOT_FOUND)
    updated = await crud.rally_event.update(db, db_obj=event, obj_in=event_in)
    return RallyEventResponse.model_validate(updated)


@router.post(
    "/events/{event_id}/set-current",
    tags=["Events"],
    responses=EVENT_NOT_FOUND_RESPONSES,
)
async def set_current_event(
    event_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[DetailedUser, Depends(get_admin)],
    _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> RallyEventResponse:
    """Make the given event the sole current edition (admin/manager only)."""
    event = await crud.rally_event.set_current(db, event_id=event_id)
    if event is None:
        raise RallyNotFoundError(EVENT_NOT_FOUND)
    return RallyEventResponse.model_validate(event)


class RotationScheduleResponse(BaseModel):
    event_id: int
    rounds: list[list[dict[str, Any]]]


@router.post(
    "/events/{event_id}/rotation-schedule",
    tags=["Events"],
    responses={
        404: {"description": EVENT_NOT_FOUND},
        400: {"description": "Rotation schedule cannot be generated for this event"},
    },
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
    schedule = await EventService(db).generate_rotation_schedule(event_id)
    return RotationScheduleResponse(event_id=event_id, rounds=schedule)
