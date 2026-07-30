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
from app.services.deps import get_event_service
from app.services.event_service import EVENT_NOT_FOUND, EventService

EVENT_NOT_FOUND_RESPONSES: dict[int | str, dict[str, Any]] = {404: {"description": EVENT_NOT_FOUND}}


class RotationScheduleResponse(BaseModel):
    event_id: int
    rounds: list[list[dict[str, Any]]]


class EventController:
    """REST controller for rally event editions."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/events", self.list_events, methods=["GET"], name="list_events", tags=["Events"]
        )
        self.router.add_api_route(
            "/events/current",
            self.get_current_event,
            methods=["GET"],
            name="get_current_event",
            tags=["Events"],
        )
        self.router.add_api_route(
            "/events/{event_id}",
            self.get_event,
            methods=["GET"],
            name="get_event",
            tags=["Events"],
            responses=EVENT_NOT_FOUND_RESPONSES,
        )
        self.router.add_api_route(
            "/events",
            self.create_event,
            methods=["POST"],
            status_code=201,
            name="create_event",
            tags=["Events"],
        )
        self.router.add_api_route(
            "/events/{event_id}",
            self.update_event,
            methods=["PUT"],
            name="update_event",
            tags=["Events"],
            responses=EVENT_NOT_FOUND_RESPONSES,
        )
        self.router.add_api_route(
            "/events/{event_id}/set-current",
            self.set_current_event,
            methods=["POST"],
            name="set_current_event",
            tags=["Events"],
            responses=EVENT_NOT_FOUND_RESPONSES,
        )
        self.router.add_api_route(
            "/events/{event_id}/rotation-schedule",
            self.generate_rotation_schedule,
            methods=["POST"],
            name="generate_rotation_schedule",
            tags=["Events"],
            responses={
                404: {"description": EVENT_NOT_FOUND},
                400: {"description": "Rotation schedule cannot be generated for this event"},
            },
        )

    async def list_events(
        self,
        db: Annotated[AsyncSession, Depends(get_db)],
        skip: int = 0,
        limit: int = 100,
    ) -> list[RallyEventResponse]:
        """List events (newest first). Public — drives the homepage event selector."""
        events = await crud.rally_event.get_multi(db, skip=skip, limit=limit)
        return [RallyEventResponse.model_validate(e) for e in events]

    async def get_current_event(
        self, db: Annotated[AsyncSession, Depends(get_db)]
    ) -> RallyEventResponse:
        """Return the current event (bootstrapping a default one if none exists)."""
        event = await crud.rally_event.ensure_current(db)
        return RallyEventResponse.model_validate(event)

    async def get_event(
        self, event_id: int, db: Annotated[AsyncSession, Depends(get_db)]
    ) -> RallyEventResponse:
        event = await crud.rally_event.get(db, event_id)
        if event is None:
            raise RallyNotFoundError(EVENT_NOT_FOUND)
        return RallyEventResponse.model_validate(event)

    async def create_event(
        self,
        event_in: RallyEventCreate,
        db: Annotated[AsyncSession, Depends(get_db)],
        _admin: Annotated[DetailedUser, Depends(get_admin)],
        _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    ) -> RallyEventResponse:
        """Create a new event edition (admin/manager only)."""
        event = await crud.rally_event.create(db, obj_in=event_in)
        return RallyEventResponse.model_validate(event)

    async def update_event(
        self,
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

    async def set_current_event(
        self,
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

    async def generate_rotation_schedule(
        self,
        event_id: int,
        _admin: Annotated[DetailedUser, Depends(get_admin)],
        _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[EventService, Depends(get_event_service)],
    ) -> RotationScheduleResponse:
        """Generate and persist a round-robin rotation schedule for an Olympic event.

        Reads the event's current teams and checkpoints, runs the generator, and
        stores the result in RallyEvent.rotation_schedule. Returns the schedule.
        """
        schedule = await service.generate_rotation_schedule(event_id)
        return RotationScheduleResponse(event_id=event_id, rounds=schedule)


router = EventController().router
