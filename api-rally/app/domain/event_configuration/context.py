"""Configuration context loader for preflight validation."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.event_configuration.policies import default_profile
from app.domain.event_configuration.settings import new_settings_for_profile
from app.models.activity import Activity, RallyEvent
from app.models.checkpoint import CheckPoint
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.rally_settings import RallySettings
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.models.route_stage import RouteStage
from app.models.team import Team


@dataclass(frozen=True)
class ConfigurationContext:
    event: RallyEvent
    settings: RallySettings
    checkpoints: list[CheckPoint]
    route_stages: list[RouteStage]
    activities: list[Activity]
    staff_assignments: list[RallyStaffAssignment]
    guide_assignments: list[RallyGuideAssignment]
    teams: list[Team]


async def load_configuration_context(
    db: AsyncSession,
    event_id: int,
    *,
    event: RallyEvent | None = None,
    settings: RallySettings | None = None,
) -> ConfigurationContext:
    """Load all entities needed for preflight validation."""
    if event is None:
        event = await db.get(RallyEvent, event_id)
        if event is None:
            raise ValueError(f"Event {event_id} not found")

    if settings is None:
        settings = await db.scalar(select(RallySettings).where(RallySettings.event_id == event_id))
        if settings is None:
            profile = getattr(event, "event_profile", None) or default_profile(event.event_type)
            settings = new_settings_for_profile(
                event_id=event_id,
                event_type=event.event_type,
                profile=str(profile.value if hasattr(profile, "value") else profile),
                config=dict(event.config or {}),
            )

    checkpoints = list(
        (
            await db.scalars(
                select(CheckPoint).where(
                    CheckPoint.event_id == event_id, CheckPoint.is_draft.is_(False)
                )
            )
        ).all()
    )
    route_stages = list(
        (await db.scalars(select(RouteStage).where(RouteStage.event_id == event_id))).all()
    )
    activities = list(
        (
            await db.scalars(
                select(Activity).where(Activity.event_id == event_id, Activity.is_active.is_(True))
            )
        ).all()
    )
    staff_assignments = list(
        (
            await db.scalars(
                select(RallyStaffAssignment).join(CheckPoint).where(CheckPoint.event_id == event_id)
            )
        ).all()
    )
    guide_assignments = list(
        (
            await db.scalars(
                select(RallyGuideAssignment).join(Team).where(Team.event_id == event_id)
            )
        ).all()
    )
    teams = list((await db.scalars(select(Team).where(Team.event_id == event_id))).all())

    return ConfigurationContext(
        event=event,
        settings=settings,
        checkpoints=checkpoints,
        route_stages=route_stages,
        activities=activities,
        staff_assignments=staff_assignments,
        guide_assignments=guide_assignments,
        teams=teams,
    )
