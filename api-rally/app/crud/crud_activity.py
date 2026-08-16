"""
CRUD operations for activities
"""

import re
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import current_event_id
from app.models.activity import Activity, ActivityResult, EventType, RallyEvent
from app.schemas.activity import (
    ActivityCreate,
    ActivityResultCreate,
    ActivityResultUpdate,
    ActivityUpdate,
    RallyEventCreate,
    RallyEventUpdate,
)


class CRUDActivity:
    """CRUD operations for Activity model"""

    async def create(self, db: AsyncSession, *, obj_in: ActivityCreate) -> Activity:
        """Create a new activity, stamped with the current event id."""
        db_obj = Activity(
            name=obj_in.name,
            description=obj_in.description,
            activity_type=obj_in.activity_type.value,
            checkpoint_id=obj_in.checkpoint_id,
            config=obj_in.config,
            is_active=obj_in.is_active,
            event_id=await current_event_id(db),
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get(self, db: AsyncSession, id: int) -> Activity | None:
        """Get activity by ID"""
        return await db.get(Activity, id)

    async def get_multi(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 100
    ) -> list[Activity]:
        """Get the current event's activities (legacy NULL rows included)."""
        event_id = await current_event_id(db)
        stmt = (
            select(Activity)
            .where((Activity.event_id == event_id) | (Activity.event_id.is_(None)))
            .offset(skip)
            .limit(limit)
        )
        return list((await db.scalars(stmt)).all())

    async def get_by_checkpoint(self, db: AsyncSession, checkpoint_id: int) -> list[Activity]:
        """Get activities by checkpoint"""
        stmt = select(Activity).where(
            Activity.checkpoint_id == checkpoint_id, Activity.is_active.is_(True)
        )
        return list((await db.scalars(stmt)).all())

    async def update(
        self, db: AsyncSession, *, db_obj: Activity, obj_in: ActivityUpdate
    ) -> Activity:
        """Update an activity"""
        update_data = obj_in.model_dump(exclude_unset=True, mode="json")
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def remove(self, db: AsyncSession, *, id: int) -> Activity | None:
        """Remove an activity"""
        obj = await db.get(Activity, id)
        if obj is None:
            return None
        await db.delete(obj)
        await db.commit()
        return obj


class CRUDActivityResult:
    """Persistence for ActivityResult.

    Pure data access. Scoring, ranking recalculation and team-score updates
    are orchestrated by ScoringService (the higher layer), which calls these
    methods. CRUD never imports the service, so the dependency runs one way
    (Service -> CRUD) and there is no circular import.
    """

    def build(self, obj_in: ActivityResultCreate, final_score: float) -> ActivityResult:
        """Construct an ActivityResult ORM object (no DB writes, no scoring)."""
        return ActivityResult(
            activity_id=obj_in.activity_id,
            team_id=obj_in.team_id,
            result_data=obj_in.result_data,
            extra_shots=obj_in.extra_shots,
            penalties=obj_in.penalties,
            final_score=final_score,
            is_completed=True,
            completed_at=func.now(),
        )

    async def persist(
        self, db: AsyncSession, db_obj: ActivityResult, *, commit: bool = True
    ) -> ActivityResult:
        """Add and refresh an ActivityResult.

        Commits by default. Pass commit=False to only flush, so the caller can
        batch several writes into a single transaction (e.g. team-vs results
        that must persist atomically).
        """
        db.add(db_obj)
        if commit:
            await db.commit()
        else:
            await db.flush()
        await db.refresh(db_obj)
        return db_obj

    def apply_update(self, db_obj: ActivityResult, obj_in: ActivityResultUpdate) -> dict[str, Any]:
        """Set fields from the update schema in-place (no commit).

        Returns the applied data so the caller can decide whether a rescore
        is needed (e.g. when 'result_data' changed).
        """
        update_data = obj_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        return update_data

    async def get(self, db: AsyncSession, id: int) -> ActivityResult | None:
        """Get activity result by ID"""
        return await db.get(ActivityResult, id)

    async def get_by_activity_and_team(
        self, db: AsyncSession, activity_id: int, team_id: int
    ) -> ActivityResult | None:
        """Get activity result by activity and team"""
        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id, ActivityResult.team_id == team_id
        )
        return (await db.scalars(stmt)).first()

    async def get_by_activity(self, db: AsyncSession, activity_id: int) -> list[ActivityResult]:
        """Get all results for an activity"""
        stmt = (
            select(ActivityResult)
            .where(ActivityResult.activity_id == activity_id)
            .order_by(desc(ActivityResult.final_score))
        )
        return list((await db.scalars(stmt)).all())

    async def get_by_team(self, db: AsyncSession, team_id: int) -> list[ActivityResult]:
        """Get all results for a team"""
        stmt = (
            select(ActivityResult)
            .where(ActivityResult.team_id == team_id)
            .order_by(desc(ActivityResult.final_score))
        )
        return list((await db.scalars(stmt)).all())

    async def get_all(self, db: AsyncSession) -> list[ActivityResult]:
        """Get all activity results"""
        stmt = select(ActivityResult).order_by(desc(ActivityResult.completed_at))
        return list((await db.scalars(stmt)).all())

    async def delete(self, db: AsyncSession, *, db_obj: ActivityResult) -> ActivityResult:
        """Delete a result and commit (no team-score side effects)."""
        await db.delete(db_obj)
        await db.commit()
        return db_obj


def _slugify(value: str) -> str:
    """Lowercase, hyphenated, ascii-ish slug from an event name."""
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "event"


class CRUDRallyEvent:
    """CRUD operations for RallyEvent — the event-scoping entity.

    Exactly one event is ``is_current`` at a time; ``set_current`` enforces
    that. ``ensure_current`` lazily bootstraps a default event so single-event
    deployments keep working without any explicit event creation.
    """

    async def _unique_slug(self, db: AsyncSession, base: str) -> str:
        """Return ``base`` or ``base-2``/``-3``… so the slug stays unique."""
        slug = base
        n = 1
        while await db.scalar(select(RallyEvent).where(RallyEvent.slug == slug)) is not None:
            n += 1
            slug = f"{base}-{n}"
        return slug

    async def create(self, db: AsyncSession, *, obj_in: RallyEventCreate) -> RallyEvent:
        """Create a new rally event.

        If the new event is current, any previously-current event is demoted
        first so the single-current invariant holds.
        """
        slug_source = obj_in.slug or obj_in.name
        slug = await self._unique_slug(db, _slugify(slug_source))

        if obj_in.is_current:
            await self._demote_all(db)

        db_obj = RallyEvent(
            name=obj_in.name,
            slug=slug,
            description=obj_in.description,
            event_type=obj_in.event_type.value
            if isinstance(obj_in.event_type, EventType)
            else obj_in.event_type,
            config=obj_in.config,
            is_active=obj_in.is_active,
            is_current=obj_in.is_current,
            start_time=obj_in.start_time,
            end_time=obj_in.end_time,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get(self, db: AsyncSession, id: int) -> RallyEvent | None:
        """Get rally event by ID"""
        return await db.get(RallyEvent, id)

    async def get_current(self, db: AsyncSession) -> RallyEvent | None:
        """Get current rally event (None if none flagged)."""
        stmt = select(RallyEvent).where(RallyEvent.is_current.is_(True))
        return (await db.scalars(stmt)).first()

    async def ensure_current(self, db: AsyncSession) -> RallyEvent:
        """Return the current event, lazily creating a default one if absent.

        Bootstraps single-event deployments: the first read materialises a
        "Rally Tascas" event flagged current, so everything that scopes by the
        current event has something to attach to.
        """
        current = await self.get_current(db)
        if current is not None:
            return current

        # Adopt an existing non-current event if one exists, else create.
        existing = (await db.scalars(select(RallyEvent).limit(1))).first()
        if existing is not None:
            existing.is_current = True
            db.add(existing)
            await db.commit()
            await db.refresh(existing)
            return existing

        # Fixed slug, not a pre-checked unique one: concurrent bootstraps must
        # collide on the DB's unique constraint so only one insert lands. A
        # read-then-decide unique slug lets each racer land on a free, distinct
        # slug and create its own "current" event, breaking the invariant.
        default = RallyEvent(
            name="Rally Tascas",
            slug="rally-tascas",
            description="",
            event_type=EventType.RALLY_TASCAS.value,
            config={},
            is_active=True,
            is_current=True,
        )
        db.add(default)
        try:
            await db.commit()
        except IntegrityError:
            # Concurrent bootstrap (multiple uvicorn workers / background
            # workers hitting their first read at once): the slug is unique, so
            # only one insert lands. The losers adopt whatever event is now
            # current rather than failing the request.
            await db.rollback()
            current = await self.get_current(db)
            if current is None:
                raise
            return current
        await db.refresh(default)
        return default

    async def _demote_all(self, db: AsyncSession) -> None:
        """Clear is_current on every event (call before promoting one)."""
        for ev in (
            await db.scalars(select(RallyEvent).where(RallyEvent.is_current.is_(True)))
        ).all():
            ev.is_current = False
            db.add(ev)

    async def set_current(self, db: AsyncSession, *, event_id: int) -> RallyEvent | None:
        """Make ``event_id`` the sole current event."""
        target = await db.get(RallyEvent, event_id)
        if target is None:
            return None
        await self._demote_all(db)
        target.is_current = True
        db.add(target)
        await db.commit()
        await db.refresh(target)
        return target

    async def get_multi(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 100
    ) -> list[RallyEvent]:
        """Get multiple rally events (newest first)."""
        stmt = select(RallyEvent).order_by(desc(RallyEvent.created_at)).offset(skip).limit(limit)
        return list((await db.scalars(stmt)).all())

    async def update(
        self, db: AsyncSession, *, db_obj: RallyEvent, obj_in: RallyEventUpdate
    ) -> RallyEvent:
        """Update a rally event; promoting to current demotes the others."""
        update_data = obj_in.model_dump(exclude_unset=True)
        if update_data.get("is_current") is True and not db_obj.is_current:
            await self._demote_all(db)
        for field, value in update_data.items():
            if field == "event_type" and isinstance(value, EventType):
                value = value.value
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def remove(self, db: AsyncSession, *, id: int) -> RallyEvent | None:
        """Remove a rally event"""
        obj = await db.get(RallyEvent, id)
        if obj is None:
            return None
        await db.delete(obj)
        await db.commit()
        return obj


# Create instances
activity = CRUDActivity()
activity_result = CRUDActivityResult()
rally_event = CRUDRallyEvent()
