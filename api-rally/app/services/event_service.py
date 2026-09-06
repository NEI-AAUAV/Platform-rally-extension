"""Business rules for event editions: rotation-schedule generation for
Olympic events, and cloning one edition's structure into another.
"""

from typing import Any, TypeVar

from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.models.activity import Activity, EventType
from app.models.badge_definition import BadgeDefinition
from app.models.base import Base
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.checkpoint_media import CheckpointMedia
from app.models.dynamic_scoring import DynamicRule
from app.models.rally_settings import RallySettings
from app.models.route_stage import RouteStage
from app.models.team import Team
from app.utils.round_robin import generate_schedule

EVENT_NOT_FOUND = "Event not found"
SOURCE_EVENT_NOT_FOUND = "Source event not found"

ModelT = TypeVar("ModelT", bound=Base)


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

    async def clone_structure(self, event_id: int, source_event_id: int) -> dict[str, int]:
        """Copy an edition's *structure* into an empty one.

        Editions are isolated: a new event starts with nothing. Rather than
        re-entering the whole route by hand each year, an admin can seed it from
        a previous edition. Everything is copied as new rows — nothing is shared
        with the source, so scoring the clone never touches the original.

        Copied: route stages, checkpoints (with their media and guide
        indications), activities, badge definitions, dynamic rules and settings.
        Never copied: teams, results, arrivals, skips, hint reveals, awarded
        badges, participations or audit history — that is what happened in the
        source edition, and it stays there.

        Returns a per-entity count of the rows created.
        """
        if event_id == source_event_id:
            raise RallyValidationError("Cannot clone an event into itself")

        if await crud.rally_event.get(self._db, event_id) is None:
            raise RallyNotFoundError(EVENT_NOT_FOUND)
        if await crud.rally_event.get(self._db, source_event_id) is None:
            raise RallyNotFoundError(SOURCE_EVENT_NOT_FOUND)

        # Guard against a second clone stacking a duplicate route on top.
        if await self._db.scalar(
            select(CheckPoint.id).where(CheckPoint.event_id == event_id).limit(1)
        ):
            raise RallyValidationError("Target event already has checkpoints")

        stage_ids = await self._copy_event_rows(RouteStage, event_id, source_event_id)
        checkpoint_ids = await self._clone_checkpoints(event_id, source_event_id, stage_ids)
        media, indications = await self._clone_checkpoint_children(checkpoint_ids)

        counts = {
            "route_stages": len(stage_ids),
            "checkpoints": len(checkpoint_ids),
            "checkpoint_media": media,
            "checkpoint_guide_indications": indications,
            "activities": await self._clone_activities(event_id, source_event_id, checkpoint_ids),
            "badge_definitions": len(
                await self._copy_event_rows(BadgeDefinition, event_id, source_event_id)
            ),
            "dynamic_rules": len(
                await self._copy_event_rows(DynamicRule, event_id, source_event_id)
            ),
            "rally_settings": await self._clone_settings(event_id, source_event_id),
        }

        await self._db.commit()
        return counts

    async def _clone_checkpoints(
        self, event_id: int, source_event_id: int, stage_ids: dict[int, int]
    ) -> dict[int, int]:
        rows = await self._rows_for_event(CheckPoint, source_event_id)
        return {
            row.id: await self._copy_row(
                CheckPoint,
                row,
                {
                    "event_id": event_id,
                    # Stages were just recreated: point at the copy.
                    "route_stage_id": stage_ids.get(row.route_stage_id),
                },
            )
            for row in rows
        }

    async def _clone_checkpoint_children(self, checkpoint_ids: dict[int, int]) -> tuple[int, int]:
        """Copy the media and guide indications hanging off each checkpoint."""
        counts: list[int] = []
        for model in (CheckpointMedia, CheckpointGuideIndication):
            copied = 0
            for old_id, new_id in checkpoint_ids.items():
                rows = (
                    await self._db.scalars(select(model).where(model.checkpoint_id == old_id))
                ).all()
                for row in rows:
                    await self._copy_row(model, row, {"checkpoint_id": new_id})
                    copied += 1
            counts.append(copied)
        return counts[0], counts[1]

    async def _clone_activities(
        self, event_id: int, source_event_id: int, checkpoint_ids: dict[int, int]
    ) -> int:
        rows = await self._rows_for_event(Activity, source_event_id)
        copied = 0
        for row in rows:
            new_checkpoint_id = checkpoint_ids.get(row.checkpoint_id)
            if new_checkpoint_id is None:
                # Its checkpoint was not part of the source edition; without a
                # post to hang from the copy would be unreachable.
                continue
            await self._copy_row(
                Activity, row, {"event_id": event_id, "checkpoint_id": new_checkpoint_id}
            )
            copied += 1
        return copied

    async def _clone_settings(self, event_id: int, source_event_id: int) -> int:
        source = await self._db.scalar(
            select(RallySettings).where(RallySettings.event_id == source_event_id)
        )
        if source is None:
            return 0
        # get_or_create may already have bootstrapped defaults for the target;
        # the source's values are not worth clobbering them mid-edition.
        existing = await self._db.scalar(
            select(RallySettings).where(RallySettings.event_id == event_id)
        )
        if existing is not None:
            return 0
        await self._copy_row(RallySettings, source, {"event_id": event_id})
        return 1

    async def _rows_for_event(self, model: type[ModelT], event_id: int) -> list[ModelT]:
        stmt = select(model).where(model.event_id == event_id)
        order = getattr(model, "order", None)
        if order is not None:
            stmt = stmt.order_by(order)
        return list((await self._db.scalars(stmt)).all())

    async def _copy_event_rows(
        self, model: type[ModelT], event_id: int, source_event_id: int
    ) -> dict[int, int]:
        """Copy every row of ``model`` in the source event. Returns old id -> new id."""
        rows = await self._rows_for_event(model, source_event_id)
        return {row.id: await self._copy_row(model, row, {"event_id": event_id}) for row in rows}

    async def _copy_row(self, model: type[ModelT], row: ModelT, overrides: dict[str, Any]) -> int:
        """Insert a copy of ``row`` with ``overrides`` applied, and return its id.

        Columns are read off the mapper rather than listed by hand, so a new
        column on any of these models is carried into clones automatically.
        """
        values = {
            column.key: getattr(row, column.key)
            for column in inspect(model).mapper.column_attrs
            if column.key != "id"
        }
        copy = model(**(values | overrides))
        self._db.add(copy)
        await self._db.flush()
        return int(copy.id)
