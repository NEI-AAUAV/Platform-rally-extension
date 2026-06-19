"""
CRUD operations for activities
"""
from typing import Any
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, select

from app.models.activity import Activity, ActivityResult, RallyEvent
from app.schemas.activity import ActivityCreate, ActivityUpdate, ActivityResultCreate, ActivityResultUpdate, RallyEventCreate, RallyEventUpdate


class CRUDActivity:
    """CRUD operations for Activity model"""
    
    def create(self, db: Session, *, obj_in: ActivityCreate) -> Activity:
        """Create a new activity"""
        db_obj = Activity(
            name=obj_in.name,
            description=obj_in.description,
            activity_type=obj_in.activity_type.value,
            checkpoint_id=obj_in.checkpoint_id,
            config=obj_in.config,
            is_active=obj_in.is_active
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def get(self, db: Session, id: int) -> Activity | None:
        """Get activity by ID"""
        return db.get(Activity, id)
    
    def get_multi(self, db: Session, *, skip: int = 0, limit: int = 100) -> list[Activity]:
        """Get multiple activities"""
        stmt = select(Activity).offset(skip).limit(limit)
        return list(db.scalars(stmt).all())
    
    def get_by_checkpoint(self, db: Session, checkpoint_id: int) -> list[Activity]:
        """Get activities by checkpoint"""
        stmt = select(Activity).where(
            Activity.checkpoint_id == checkpoint_id,
            Activity.is_active == True
        )
        return list(db.scalars(stmt).all())
    
    def update(self, db: Session, *, db_obj: Activity, obj_in: ActivityUpdate) -> Activity:
        """Update an activity"""
        update_data = obj_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def remove(self, db: Session, *, id: int) -> Activity | None:
        """Remove an activity"""
        obj = db.get(Activity, id)
        if obj is None:
            return None
        db.delete(obj)
        db.commit()
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
            completed_at=func.now()
        )

    def persist(self, db: Session, db_obj: ActivityResult) -> ActivityResult:
        """Add, commit and refresh an ActivityResult."""
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
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

    def get(self, db: Session, id: int) -> ActivityResult | None:
        """Get activity result by ID"""
        return db.get(ActivityResult, id)

    def get_by_activity_and_team(self, db: Session, activity_id: int, team_id: int) -> ActivityResult | None:
        """Get activity result by activity and team"""
        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id,
            ActivityResult.team_id == team_id
        )
        return db.scalars(stmt).first()

    def get_by_activity(self, db: Session, activity_id: int) -> list[ActivityResult]:
        """Get all results for an activity"""
        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id
        ).order_by(desc(ActivityResult.final_score))
        return list(db.scalars(stmt).all())

    def get_by_team(self, db: Session, team_id: int) -> list[ActivityResult]:
        """Get all results for a team"""
        stmt = select(ActivityResult).where(
            ActivityResult.team_id == team_id
        ).order_by(desc(ActivityResult.final_score))
        return list(db.scalars(stmt).all())

    def get_all(self, db: Session) -> list[ActivityResult]:
        """Get all activity results"""
        stmt = select(ActivityResult).order_by(desc(ActivityResult.completed_at))
        return list(db.scalars(stmt).all())

    def delete(self, db: Session, *, db_obj: ActivityResult) -> ActivityResult:
        """Delete a result and commit (no team-score side effects)."""
        db.delete(db_obj)
        db.commit()
        return db_obj


class CRUDRallyEvent:
    """CRUD operations for RallyEvent model"""
    
    def create(self, db: Session, *, obj_in: RallyEventCreate) -> RallyEvent:
        """Create a new rally event"""
        db_obj = RallyEvent(
            name=obj_in.name,
            description=obj_in.description,
            config=obj_in.config,
            is_active=obj_in.is_active,
            is_current=obj_in.is_current,
            start_time=obj_in.start_time,
            end_time=obj_in.end_time
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def get(self, db: Session, id: int) -> RallyEvent | None:
        """Get rally event by ID"""
        return db.get(RallyEvent, id)
    
    def get_current(self, db: Session) -> RallyEvent | None:
        """Get current rally event"""
        stmt = select(RallyEvent).where(RallyEvent.is_current == True)
        return db.scalars(stmt).first()
    
    def get_multi(self, db: Session, *, skip: int = 0, limit: int = 100) -> list[RallyEvent]:
        """Get multiple rally events"""
        stmt = select(RallyEvent).offset(skip).limit(limit)
        return list(db.scalars(stmt).all())
    
    def update(self, db: Session, *, db_obj: RallyEvent, obj_in: RallyEventUpdate) -> RallyEvent:
        """Update a rally event"""
        update_data = obj_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def remove(self, db: Session, *, id: int) -> RallyEvent | None:
        """Remove a rally event"""
        obj = db.get(RallyEvent, id)
        if obj is None:
            return None
        db.delete(obj)
        db.commit()
        return obj


# Create instances
activity = CRUDActivity()
activity_result = CRUDActivityResult()
rally_event = CRUDRallyEvent()
