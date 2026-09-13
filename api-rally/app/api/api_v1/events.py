"""Event (edition) management endpoints.

An event scopes teams, checkpoints, activities and settings. Exactly one event
is "current"; public reads resolve to it. Admins/managers can create new
editions and switch the current one without wiping the database.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Security
from pydantic import BaseModel
from sqlalchemy import func, select
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
from app.core.config import settings as app_settings
from app.core.exceptions import RallyConfigurationError, RallyConflictError
from app.domain.event_configuration.policies import EventProfile, profile_is_supported
from app.domain.event_configuration.reconciler import reconcile_policy_state
from app.domain.event_configuration.settings import new_settings_for_profile
from app.domain.event_configuration.validator import ConfigurationValidator
from app.models.activity import Activity, ActivityResult, EventType
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_skip import CheckpointSkip
from app.models.dynamic_scoring import DynamicAward
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.rally_settings import RallySettings
from app.models.route_stage import RouteStage

EVENT_NOT_FOUND_RESPONSES: dict[int | str, dict[str, Any]] = {404: {"description": EVENT_NOT_FOUND}}


class RotationScheduleResponse(BaseModel):
    event_id: int
    rounds: list[list[dict[str, Any]]]


class CloneStructureResponse(BaseModel):
    """How many rows of each kind the clone created."""

    event_id: int
    source_event_id: int
    created: dict[str, int]


class ChangeEventFormatRequest(BaseModel):
    event_type: EventType
    event_profile: EventProfile


class ChangeEventFormatResponse(BaseModel):
    event: RallyEventResponse
    changes: list[dict[str, Any]]
    issues: list[dict[str, Any]]
    ready: bool


class ConfigurationIssueResponse(BaseModel):
    code: str
    severity: str
    message: str
    fields: list[str] | None = None
    entity_type: str | None = None
    entity_ids: list[int] | None = None
    suggestion: str | None = None
    autofix: str | None = None


class EffectiveCapabilityResponse(BaseModel):
    policy: str
    configured: bool
    available: bool
    effective: bool


class ConfigurationStatusResponse(BaseModel):
    event_type: str
    event_profile: str
    ready: bool
    capabilities: dict[str, EffectiveCapabilityResponse]
    issues: list[ConfigurationIssueResponse]


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
            "/events/{event_id}/configuration-status", self.configuration_status,
            methods=["GET"], name="event_configuration_status", tags=["Events"], responses=EVENT_NOT_FOUND_RESPONSES,
        )
        self.router.add_api_route(
            "/events/{event_id}/change-format", self.change_format,
            methods=["POST"], name="change_event_format", tags=["Events"], responses=EVENT_NOT_FOUND_RESPONSES,
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
            "/events/{event_id}/clone-from/{source_event_id}",
            self.clone_event_structure,
            methods=["POST"],
            name="clone_event_structure",
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

    async def configuration_status(
        self, event_id: int, db: Annotated[AsyncSession, Depends(get_db)],
        _admin: Annotated[DetailedUser, Depends(get_admin)],
        _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    ) -> ConfigurationStatusResponse:
        event = await crud.rally_event.get(db, event_id)
        if event is None:
            raise RallyNotFoundError(EVENT_NOT_FOUND)
        settings_row = await db.scalar(select(RallySettings).where(RallySettings.event_id == event_id))
        # A just-created edition has no settings yet: do not mutate it merely to inspect readiness.
        if settings_row is None:
            settings_row = new_settings_for_profile(event_id=event_id, event_type=event.event_type, profile=event.event_profile, config=dict(event.config or {}))
        checkpoints = list((await db.scalars(select(CheckPoint).where(CheckPoint.event_id == event_id, CheckPoint.is_draft.is_(False)))).all())
        stages = list((await db.scalars(select(RouteStage).where(RouteStage.event_id == event_id))).all())
        report = ConfigurationValidator.validate(event=event, settings=settings_row, checkpoints=checkpoints, route_stages=stages, platform_qr_supported=app_settings.SELF_CHECKIN_ENABLED)
        return ConfigurationStatusResponse(event_type=report.event_type, event_profile=report.event_profile, ready=report.ready, capabilities=report.capabilities, issues=[{**issue.__dict__, "severity": issue.severity.value} for issue in report.issues])

    async def change_format(
        self, event_id: int, format_in: ChangeEventFormatRequest,
        db: Annotated[AsyncSession, Depends(get_db)],
        _admin: Annotated[DetailedUser, Depends(get_admin)],
        _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    ) -> ChangeEventFormatResponse:
        event = await crud.rally_event.get(db, event_id)
        if event is None:
            raise RallyNotFoundError(EVENT_NOT_FOUND)
        if not profile_is_supported(format_in.event_type.value, format_in.event_profile):
            raise RallyConfigurationError(
                "O perfil operacional não está disponível para este tipo de evento.",
                details={"code": "UNSUPPORTED_EVENT_PROFILE", "event_type": format_in.event_type.value, "event_profile": format_in.event_profile.value},
            )
        has_arrivals = bool(await db.scalar(select(func.count()).select_from(CheckpointArrival).join(CheckPoint).where(CheckPoint.event_id == event_id)))
        has_skips = bool(await db.scalar(select(func.count()).select_from(CheckpointSkip).join(CheckPoint).where(CheckPoint.event_id == event_id)))
        has_results = bool(await db.scalar(select(func.count()).select_from(ActivityResult).join(Activity).where(Activity.event_id == event_id)))
        has_awards = bool(await db.scalar(select(func.count()).select_from(DynamicAward).where(DynamicAward.event_id == event_id)))
        has_hints = bool(await db.scalar(select(func.count()).select_from(CheckpointHintReveal).join(CheckPoint).where(CheckPoint.event_id == event_id)))
        if has_arrivals or has_skips or has_results or has_awards or has_hints:
            raise RallyConflictError("Não é possível alterar o formato de um evento que já possui progresso ou resultados.", details={"code": "EVENT_FORMAT_LOCKED"})
        settings_row = await db.scalar(select(RallySettings).where(RallySettings.event_id == event_id))
        if settings_row is None:
            settings_row = new_settings_for_profile(event_id=event_id, event_type=event.event_type, profile=event.event_profile, config=dict(event.config or {}))
            db.add(settings_row)
        config = dict(event.config or {})
        changes = reconcile_policy_state(event_type=format_in.event_type.value, profile=format_in.event_profile.value, settings=settings_row, config=config).changes
        event.event_type, event.event_profile, event.config = format_in.event_type.value, format_in.event_profile.value, config
        db.add(event)
        await db.commit()
        await db.refresh(event)
        checkpoints = list((await db.scalars(select(CheckPoint).where(CheckPoint.event_id == event_id, CheckPoint.is_draft.is_(False)))).all())
        stages = list((await db.scalars(select(RouteStage).where(RouteStage.event_id == event_id))).all())
        report = ConfigurationValidator.validate(event=event, settings=settings_row, checkpoints=checkpoints, route_stages=stages, platform_qr_supported=app_settings.SELF_CHECKIN_ENABLED)
        return ChangeEventFormatResponse(event=RallyEventResponse.model_validate(event), changes=changes, issues=[{**issue.__dict__, "severity": issue.severity.value} for issue in report.issues], ready=report.ready)

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

    async def clone_event_structure(
        self,
        event_id: int,
        source_event_id: int,
        _admin: Annotated[DetailedUser, Depends(get_admin)],
        _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[EventService, Depends(get_event_service)],
    ) -> CloneStructureResponse:
        """Seed an empty edition from a previous one (admin/manager only).

        Copies structure only — route, activities, badges, rules, settings.
        Teams and everything they did stay in the source edition.
        """
        created = await service.clone_structure(event_id, source_event_id)
        return CloneStructureResponse(
            event_id=event_id, source_event_id=source_event_id, created=created
        )

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
