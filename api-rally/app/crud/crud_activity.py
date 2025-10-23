"""
CRUD operations for activities
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func

from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.team import Team
from app.models.activity_factory import ActivityFactory
from app.schemas.activity import ActivityCreate, ActivityUpdate, ActivityResultCreate, ActivityResultUpdate


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
            is_active=obj_in.is_active,
            order=obj_in.order
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def get(self, db: Session, id: int) -> Optional[Activity]:
        """Get activity by ID"""
        return db.query(Activity).filter(Activity.id == id).first()
    
    def get_multi(self, db: Session, *, skip: int = 0, limit: int = 100) -> List[Activity]:
        """Get multiple activities"""
        return db.query(Activity).offset(skip).limit(limit).all()
    
    def get_by_checkpoint(self, db: Session, checkpoint_id: int) -> List[Activity]:
        """Get activities by checkpoint"""
        return db.query(Activity).filter(
            Activity.checkpoint_id == checkpoint_id,
            Activity.is_active == True
        ).order_by(Activity.order).all()
    
    def update(self, db: Session, *, db_obj: Activity, obj_in: ActivityUpdate) -> Activity:
        """Update an activity"""
        update_data = obj_in.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def remove(self, db: Session, *, id: int) -> Activity:
        """Remove an activity"""
        obj = db.query(Activity).get(id)
        db.delete(obj)
        db.commit()
        return obj


class CRUDActivityResult:
    """CRUD operations for ActivityResult model"""
    
    def create(self, db: Session, *, obj_in: ActivityResultCreate) -> ActivityResult:
        """Create a new activity result"""
        # Calculate scores using the activity factory
        activity = db.query(Activity).filter(Activity.id == obj_in.activity_id).first()
        if not activity:
            raise ValueError(f"Activity {obj_in.activity_id} not found")
        
        # Create activity instance and calculate scores
        activity_instance = ActivityFactory.create_activity(
            activity.activity_type, 
            activity.config
        )
        
        # Validate result data
        if not activity_instance.validate_result(obj_in.result_data):
            raise ValueError("Invalid result data for activity type")
        
        # Calculate base score
        team = db.query(Team).filter(Team.id == obj_in.team_id).first()
        team_size = len(team.members) if team else 0
        
        base_score = activity_instance.calculate_score(obj_in.result_data, team_size)
        
        # Apply modifiers
        modifiers = {
            'extra_shots': obj_in.extra_shots,
            'costume_bonus': obj_in.costume_bonus,
            'penalties': obj_in.penalties
        }
        final_score = activity_instance.apply_modifiers(base_score, modifiers, db)
        
        # Create result object
        db_obj = ActivityResult(
            activity_id=obj_in.activity_id,
            team_id=obj_in.team_id,
            result_data=obj_in.result_data,
            extra_shots=obj_in.extra_shots,
            costume_bonus=obj_in.costume_bonus,
            penalties=obj_in.penalties,
            final_score=final_score,
            is_completed=True,
            completed_at=func.now()
        )
        
        # Set specific score fields based on activity type
        if activity.activity_type == 'TimeBasedActivity':
            db_obj.time_score = obj_in.result_data.get('completion_time_seconds')
        elif activity.activity_type == 'ScoreBasedActivity':
            db_obj.points_score = obj_in.result_data.get('achieved_points')
        elif activity.activity_type == 'BooleanActivity':
            db_obj.boolean_score = obj_in.result_data.get('success')
        elif activity.activity_type == 'TeamVsActivity':
            db_obj.team_vs_result = obj_in.result_data.get('result')
        elif activity.activity_type == 'GeneralActivity':
            db_obj.points_score = obj_in.result_data.get('assigned_points')
        
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def get(self, db: Session, id: int) -> Optional[ActivityResult]:
        """Get activity result by ID"""
        return db.query(ActivityResult).filter(ActivityResult.id == id).first()
    
    def get_by_activity_and_team(self, db: Session, activity_id: int, team_id: int) -> Optional[ActivityResult]:
        """Get activity result by activity and team"""
        return db.query(ActivityResult).filter(
            ActivityResult.activity_id == activity_id,
            ActivityResult.team_id == team_id
        ).first()
    
    def get_by_activity(self, db: Session, activity_id: int) -> List[ActivityResult]:
        """Get all results for an activity"""
        return db.query(ActivityResult).filter(
            ActivityResult.activity_id == activity_id
        ).order_by(desc(ActivityResult.final_score)).all()
    
    def get_by_team(self, db: Session, team_id: int) -> List[ActivityResult]:
        """Get all results for a team"""
        return db.query(ActivityResult).filter(
            ActivityResult.team_id == team_id
        ).order_by(desc(ActivityResult.final_score)).all()
    
    def update(self, db: Session, *, db_obj: ActivityResult, obj_in: ActivityResultUpdate) -> ActivityResult:
        """Update an activity result"""
        update_data = obj_in.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        
        # Recalculate final score if result data changed
        if 'result_data' in update_data:
            activity = db.query(Activity).filter(Activity.id == db_obj.activity_id).first()
            activity_instance = ActivityFactory.create_activity(
                activity.activity_type, 
                activity.config
            )
            
            team = db.query(Team).filter(Team.id == db_obj.team_id).first()
            team_size = len(team.members) if team else 0
            
            base_score = activity_instance.calculate_score(db_obj.result_data, team_size)
            modifiers = {
                'extra_shots': db_obj.extra_shots,
                'costume_bonus': db_obj.costume_bonus,
                'penalties': db_obj.penalties
            }
            db_obj.final_score = activity_instance.apply_modifiers(base_score, modifiers, db)
        
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def remove(self, db: Session, *, id: int) -> ActivityResult:
        """Remove an activity result"""
        obj = db.query(ActivityResult).get(id)
        db.delete(obj)
        db.commit()
        return obj


class CRUDRallyEvent:
    """CRUD operations for RallyEvent model"""
    
    def create(self, db: Session, *, obj_in) -> RallyEvent:
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
    
    def get(self, db: Session, id: int) -> Optional[RallyEvent]:
        """Get rally event by ID"""
        return db.query(RallyEvent).filter(RallyEvent.id == id).first()
    
    def get_current(self, db: Session) -> Optional[RallyEvent]:
        """Get current rally event"""
        return db.query(RallyEvent).filter(RallyEvent.is_current == True).first()
    
    def get_multi(self, db: Session, *, skip: int = 0, limit: int = 100) -> List[RallyEvent]:
        """Get multiple rally events"""
        return db.query(RallyEvent).offset(skip).limit(limit).all()
    
    def update(self, db: Session, *, db_obj: RallyEvent, obj_in) -> RallyEvent:
        """Update a rally event"""
        update_data = obj_in.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def remove(self, db: Session, *, id: int) -> RallyEvent:
        """Remove a rally event"""
        obj = db.query(RallyEvent).get(id)
        db.delete(obj)
        db.commit()
        return obj


# Create instances
activity = CRUDActivity()
activity_result = CRUDActivityResult()
rally_event = CRUDRallyEvent()
