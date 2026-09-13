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
from app.core.config import settings as app_settings
from app.core.exceptions import RallyConfigurationError, RallyConflictError, RallyNotFoundError
from app.domain.event_configuration.context import load_configuration_context
from app.domain.event_configuration.policies import (
    Capability,
    CapabilityPolicy,
    EventProfile,
    profile_is_supported,
    resolve_policy,
)
from app.domain.event_configuration.reconciler import reconcile_policy_state
from app.domain.event_configuration.settings import new_settings_for_profile
from app.domain.event_configuration.validator import (
    ConfigurationIssue,
    ConfigurationIssueSeverity,
    ConfigurationValidator,
)
from app.models.activity import Activity, ActivityResult, EventType
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.checkpoint_skip import CheckpointSkip
from app.models.dynamic_scoring import DynamicAward
from app.models.rally_settings import RallySettings
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


class CloneStructureResponse(BaseModel):
    """How many rows of each kind the clone created."""

    event_id: int
    source_event_id: int
    created: dict[str, int]


class ChangeEventFormatRequest(BaseModel):
    event_type: EventType
    event_profile: EventProfile


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


class ChangeEventFormatResponse(BaseModel):
    event: RallyEventResponse
    changes: list[dict[str, Any]]
    issues: list[ConfigurationIssueResponse]
    ready: bool


class ConfigurationStatusResponse(BaseModel):
    event_type: str
    event_profile: str
    ready: bool
    capabilities: dict[str, EffectiveCapabilityResponse]
    issues: list[ConfigurationIssueResponse]


class UpdateEventCapabilitiesRequest(BaseModel):
    qr_arrival: bool | None = None
    drinking_scoring: bool | None = None


def _serialize_issue(issue: ConfigurationIssue) -> ConfigurationIssueResponse:
    return ConfigurationIssueResponse(
        code=issue.code,
        severity=issue.severity.value,
        message=issue.message,
        fields=issue.fields,
        entity_type=issue.entity_type,
        entity_ids=issue.entity_ids,
        suggestion=issue.suggestion,
        autofix=issue.autofix,
    )


def _serialize_capabilities(
    caps: dict[str, dict[str, Any]],
) -> dict[str, EffectiveCapabilityResponse]:
    return {
        k: EffectiveCapabilityResponse(
            policy=str(v["policy"]),
            configured=bool(v["configured"]),
            available=bool(v["available"]),
            effective=bool(v["effective"]),
        )
        for k, v in caps.items()
    }


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
            "/events/{event_id}/configuration-status",
            self.configuration_status,
            methods=["GET"],
            name="event_configuration_status",
            tags=["Events"],
            responses=EVENT_NOT_FOUND_RESPONSES,
        )
        self.router.add_api_route(
            "/events/{event_id}/capabilities",
            self.update_event_capabilities,
            methods=["PATCH"],
            name="update_event_capabilities",
            tags=["Events"],
            responses=EVENT_NOT_FOUND_RESPONSES,
        )
        self.router.add_api_route(
            "/events/{event_id}/change-format",
            self.change_format,
            methods=["POST"],
            name="change_event_format",
            tags=["Events"],
            responses=EVENT_NOT_FOUND_RESPONSES,
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
        self,
        event_id: int,
        db: Annotated[AsyncSession, Depends(get_db)],
        _admin: Annotated[DetailedUser, Depends(get_admin)],
        _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    ) -> ConfigurationStatusResponse:
        event = await crud.rally_event.get(db, event_id)
        if event is None:
            raise RallyNotFoundError(EVENT_NOT_FOUND)
        ctx = await load_configuration_context(db, event_id, event=event)
        report = ConfigurationValidator.validate(
            event=ctx.event,
            settings=ctx.settings,
            checkpoints=ctx.checkpoints,
            route_stages=ctx.route_stages,
            platform_qr_supported=app_settings.SELF_CHECKIN_ENABLED,
            activities=ctx.activities,
            staff_assignments=ctx.staff_assignments,
            guide_assignments=ctx.guide_assignments,
            teams=ctx.teams,
        )
        return ConfigurationStatusResponse(
            event_type=report.event_type,
            event_profile=report.event_profile,
            ready=report.ready,
            capabilities=_serialize_capabilities(report.capabilities),
            issues=[_serialize_issue(issue) for issue in report.issues],
        )

    async def update_event_capabilities(
        self,
        event_id: int,
        caps_in: UpdateEventCapabilitiesRequest,
        db: Annotated[AsyncSession, Depends(get_db)],
        _admin: Annotated[DetailedUser, Depends(get_admin)],
        _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    ) -> ConfigurationStatusResponse:
        event = await crud.rally_event.get(db, event_id)
        if event is None:
            raise RallyNotFoundError(EVENT_NOT_FOUND)
        policy = resolve_policy(event.event_type, event.event_profile)
        config = dict(event.config or {})

        updates = caps_in.model_dump(exclude_unset=True)
        cap_map = {
            "qr_arrival": (Capability.QR_ARRIVAL, "qr_checkin_enabled"),
            "drinking_scoring": (Capability.DRINKING_SCORING, "drinking_scoring"),
        }
        for field, value in updates.items():
            if field not in cap_map or value is None:
                continue
            cap, config_key = cap_map[field]
            cap_policy = policy.policy_for(cap)
            if cap_policy is CapabilityPolicy.REQUIRED and value is False:
                raise RallyConfigurationError(
                    f"A capacidade '{cap.value}' é obrigatória neste perfil.",
                    details={"code": "REQUIRED_CAPABILITY_DISABLED", "capability": cap.value},
                )
            if cap_policy is CapabilityPolicy.FORBIDDEN and value is True:
                raise RallyConfigurationError(
                    f"A capacidade '{cap.value}' não é permitida neste perfil.",
                    details={"code": "FORBIDDEN_CAPABILITY_ENABLED", "capability": cap.value},
                )
            if (
                cap is Capability.QR_ARRIVAL
                and value is True
                and not app_settings.SELF_CHECKIN_ENABLED
            ):
                raise RallyConfigurationError(
                    "Check-in por QR indisponível nesta plataforma.",
                    details={"code": "QR_UNAVAILABLE_ON_PLATFORM"},
                )
            config[config_key] = value

        event.config = config
        settings_row = await db.scalar(
            select(RallySettings).where(RallySettings.event_id == event_id)
        )
        if settings_row is None:
            settings_row = new_settings_for_profile(
                event_id=event_id,
                event_type=event.event_type,
                profile=event.event_profile,
                config=config,
            )
        local_issues = ConfigurationValidator.local_issues(
            event_type=event.event_type,
            profile=event.event_profile,
            settings=settings_row,
            config=config,
        )
        errors = [i for i in local_issues if i.severity is ConfigurationIssueSeverity.ERROR]
        if errors:
            raise RallyConfigurationError(
                "Configuração de evento inválida.",
                details={
                    "code": "INVALID_EVENT_CONFIGURATION",
                    "issues": [{**i.__dict__, "severity": i.severity.value} for i in errors],
                },
            )
        db.add(event)
        await db.commit()
        await db.refresh(event)

        ctx = await load_configuration_context(db, event_id, event=event, settings=settings_row)
        report = ConfigurationValidator.validate(
            event=ctx.event,
            settings=ctx.settings,
            checkpoints=ctx.checkpoints,
            route_stages=ctx.route_stages,
            platform_qr_supported=app_settings.SELF_CHECKIN_ENABLED,
            activities=ctx.activities,
            staff_assignments=ctx.staff_assignments,
            guide_assignments=ctx.guide_assignments,
            teams=ctx.teams,
        )
        return ConfigurationStatusResponse(
            event_type=report.event_type,
            event_profile=report.event_profile,
            ready=report.ready,
            capabilities=_serialize_capabilities(report.capabilities),
            issues=[_serialize_issue(issue) for issue in report.issues],
        )

    async def change_format(
        self,
        event_id: int,
        format_in: ChangeEventFormatRequest,
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
                details={
                    "code": "UNSUPPORTED_EVENT_PROFILE",
                    "event_type": format_in.event_type.value,
                    "event_profile": format_in.event_profile.value,
                },
            )
        has_arrivals = bool(
            await db.scalar(
                select(func.count())
                .select_from(CheckpointArrival)
                .join(CheckPoint)
                .where(CheckPoint.event_id == event_id)
            )
        )
        has_skips = bool(
            await db.scalar(
                select(func.count())
                .select_from(CheckpointSkip)
                .join(CheckPoint)
                .where(CheckPoint.event_id == event_id)
            )
        )
        has_results = bool(
            await db.scalar(
                select(func.count())
                .select_from(ActivityResult)
                .join(Activity)
                .where(Activity.event_id == event_id)
            )
        )
        has_awards = bool(
            await db.scalar(
                select(func.count())
                .select_from(DynamicAward)
                .where(DynamicAward.event_id == event_id)
            )
        )
        has_hints = bool(
            await db.scalar(
                select(func.count())
                .select_from(CheckpointHintReveal)
                .join(CheckPoint)
                .where(CheckPoint.event_id == event_id)
            )
        )
        if has_arrivals or has_skips or has_results or has_awards or has_hints:
            raise RallyConflictError(
                "Não é possível alterar o formato de um evento que já possui "
                "progresso ou resultados.",
                details={"code": "EVENT_FORMAT_LOCKED"},
            )
        settings_row = await db.scalar(
            select(RallySettings).where(RallySettings.event_id == event_id)
        )
        if settings_row is None:
            settings_row = new_settings_for_profile(
                event_id=event_id,
                event_type=event.event_type,
                profile=event.event_profile,
                config=dict(event.config or {}),
            )
            db.add(settings_row)
        config = dict(event.config or {})
        changes = reconcile_policy_state(
            event_type=format_in.event_type.value,
            profile=format_in.event_profile.value,
            settings=settings_row,
            config=config,
        ).changes
        event.event_type, event.event_profile, event.config = (
            format_in.event_type.value,
            format_in.event_profile.value,
            config,
        )
        if (
            format_in.event_type.value != "olympic" or format_in.event_profile.value != "rotation"
        ) and event.rotation_schedule is not None:
            event.rotation_schedule = None
            changes.append(
                {
                    "field": "rotation_schedule",
                    "from": "schedule",
                    "to": None,
                    "reason": "cleared_on_format_change",
                }
            )
        db.add(settings_row)
        db.add(event)
        await db.flush()

        local_issues = ConfigurationValidator.local_issues(
            event_type=event.event_type,
            profile=event.event_profile,
            settings=settings_row,
            config=config,
        )
        errors = [i for i in local_issues if i.severity is ConfigurationIssueSeverity.ERROR]
        if errors:
            raise RallyConfigurationError(
                "Transição de formato inválida.",
                details={
                    "code": "INVALID_EVENT_CONFIGURATION",
                    "issues": [{**i.__dict__, "severity": i.severity.value} for i in errors],
                },
            )
        await db.commit()
        await db.refresh(event)
        await db.refresh(settings_row)

        ctx = await load_configuration_context(db, event_id, event=event, settings=settings_row)
        report = ConfigurationValidator.validate(
            event=ctx.event,
            settings=ctx.settings,
            checkpoints=ctx.checkpoints,
            route_stages=ctx.route_stages,
            platform_qr_supported=app_settings.SELF_CHECKIN_ENABLED,
            activities=ctx.activities,
            staff_assignments=ctx.staff_assignments,
            guide_assignments=ctx.guide_assignments,
            teams=ctx.teams,
        )
        return ChangeEventFormatResponse(
            event=RallyEventResponse.model_validate(event),
            changes=changes,
            issues=[_serialize_issue(issue) for issue in report.issues],
            ready=report.ready,
        )

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
