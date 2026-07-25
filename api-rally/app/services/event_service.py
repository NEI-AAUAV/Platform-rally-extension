"""Business rules for event editions: rotation-schedule generation for
Olympic events. 
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.models.activity import EventType
from app.models.checkpoint import CheckPoint
from app.models.team import Team
from app.utils.round_robin import generate_schedule

EVENT_NOT_FOUND = "Event not found"


class EventService:
    """Event edition lifecycle rules beyond plain CRUD."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def generate_rotation_schedule(self, event_id: int) -> list[list[dict[str, Any]]]:
        """Generate and persist a round-robin rotation schedule for an
        Olympic event, from its current teams and checkpoints."""
        event = await crud.rally_event.get(self._db, event_id)
        if event is None:
            raise RallyNotFoundError(EVENT_NOT_FOUND)
        if event.event_type != EventType.OLYMPIC.value:
            raise RallyValidationError("Rotation schedule only available for Olympic events")

        teams = list((await self._db.scalars(select(Team).where(Team.event_id == event_id))).all())
        checkpoints = list(
            (
                await self._db.scalars(select(CheckPoint).where(CheckPoint.event_id == event_id))
            ).all()
        )

        if not teams or not checkpoints:
            raise RallyValidationError("Event has no teams or checkpoints")

        team_ids = [t.id for t in teams]
        checkpoint_ids = [c.id for c in checkpoints]
        schedule = generate_schedule(team_ids, checkpoint_ids)

        event.rotation_schedule = schedule
        await self._db.commit()
        return schedule
