"""
CRUD operations for activities
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func

from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.team import Team
from app.models.activity_factory import ActivityFactory
from app.schemas.activity import ActivityCreate, ActivityUpdate, ActivityResultCreate, ActivityResultUpdate
# ScoringService imported locally to avoid circular imports


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
        ).all()
    
    def update(self, db: Session, *, db_obj: Activity, obj_in: ActivityUpdate) -> Activity:
        """Update an activity"""
        update_data = obj_in.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def remove(self, db: Session, *, id: int) -> Optional[Activity]:
        """Remove an activity"""
        obj = db.query(Activity).get(id)
        if obj is None:
            return None
        db.delete(obj)
        db.commit()
        return obj


class CRUDActivityResult:
    """CRUD operations for ActivityResult model"""
    
    def create(self, db: Session, *, obj_in: ActivityResultCreate) -> ActivityResult:
        """Create a new activity result"""
        # Validate activity exists
        activity = self._get_activity_for_result(db, obj_in.activity_id)
        
        # Create activity instance and validate result data
        activity_instance = ActivityFactory.create_activity(
            activity.activity_type, 
            activity.config
        )
        
        if not activity_instance.validate_result(obj_in.result_data, obj_in.team_id, db):
            raise ValueError("Invalid result data for activity type")
        
        # Calculate final score
        final_score = self._calculate_final_score(db, activity_instance, obj_in)
        
        # Create result object
        db_obj = self._create_result_object(obj_in, final_score)
        
        # Set specific score fields based on activity type
        self._set_activity_specific_scores(db_obj, activity, obj_in.result_data)
        
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        
        # If this is a TimeBasedActivity, recalculate ALL existing results for this activity
        # since the ranking has changed
        if activity.activity_type == 'TimeBasedActivity':
            self._recalculate_all_results_for_activity(db, activity.id)
        
        # Update team scores after creating result
        self._update_team_scores(db, obj_in.team_id)
        
        return db_obj
    
    def _get_activity_for_result(self, db: Session, activity_id: int) -> Activity:
        """Get activity and validate it exists"""
        activity = db.query(Activity).filter(Activity.id == activity_id).first()
        if not activity:
            raise ValueError(f"Activity {activity_id} not found")
        return activity
    
    def _get_team_size(self, db: Session, team_id: int) -> int:
        """Get team size for scoring"""
        team = db.query(Team).filter(Team.id == team_id).first()
        return len(team.members) if team and team.members else 1
    
    def _get_all_times_for_ranking(self, db: Session, activity_id: int, current_time: float) -> list:
        """Get all completion times including current result"""
        existing_results = db.query(ActivityResult).filter(
            ActivityResult.activity_id == activity_id,
            ActivityResult.is_completed == True
        ).all()
        
        all_times = [result.time_score for result in existing_results if result.time_score]
        if current_time:
            all_times.append(current_time)
        
        return all_times
    
    def _calculate_with_relative_ranking(self, db: Session, activity_instance, obj_in: ActivityResultCreate) -> float:
        """Calculate score using relative ranking for time-based activities"""
        all_times = self._get_all_times_for_ranking(
            db, 
            obj_in.activity_id, 
            obj_in.result_data.get('completion_time_seconds')
        )
        
        if len(all_times) <= 1:
            team_size = self._get_team_size(db, obj_in.team_id)
            return activity_instance.calculate_score(obj_in.result_data, team_size)
        
        if hasattr(activity_instance, 'calculate_relative_ranking_score'):
            return activity_instance.calculate_relative_ranking_score(
                all_times,
                obj_in.result_data['completion_time_seconds']
            )
        
        team_size = self._get_team_size(db, obj_in.team_id)
        return activity_instance.calculate_score(obj_in.result_data, team_size)
    
    def _calculate_final_score(self, db: Session, activity_instance, obj_in: ActivityResultCreate) -> float:
        """Calculate the final score for the activity result"""
        is_time_based = activity_instance.__class__.__name__ == 'TimeBasedActivity'
        
        # Use relative ranking for time-based activities
        if is_time_based:
            base_score = self._calculate_with_relative_ranking(db, activity_instance, obj_in)
        else:
            team_size = self._get_team_size(db, obj_in.team_id)
            base_score = activity_instance.calculate_score(obj_in.result_data, team_size)
        
        # Apply modifiers
        modifiers = {
            'extra_shots': obj_in.extra_shots,
            'penalties': obj_in.penalties
        }
        return activity_instance.apply_modifiers(base_score, modifiers, db)
    
    def _create_result_object(self, obj_in: ActivityResultCreate, final_score: float) -> ActivityResult:
        """Create the ActivityResult database object"""
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
    
    def _set_activity_specific_scores(self, db_obj: ActivityResult, activity: Activity, result_data: dict) -> None:
        """Set specific score fields based on activity type"""
        if activity.activity_type == 'TimeBasedActivity':
            db_obj.time_score = result_data.get('completion_time_seconds')
        elif activity.activity_type == 'ScoreBasedActivity':
            db_obj.points_score = result_data.get('achieved_points')
        elif activity.activity_type == 'BooleanActivity':
            db_obj.boolean_score = result_data.get('success')
        elif activity.activity_type == 'TeamVsActivity':
            db_obj.team_vs_result = result_data.get('result')
        elif activity.activity_type == 'GeneralActivity':
            db_obj.points_score = result_data.get('assigned_points')
    
    def _validate_time_based_activity(self, db: Session, activity_id: int):
        """Validate that activity is time-based"""
        activity = db.query(Activity).filter(Activity.id == activity_id).first()
        if not activity or activity.activity_type != 'TimeBasedActivity':
            return None, None
        return activity, activity.activity_type
    
    def _get_all_completed_times(self, all_results):
        """Extract all completion times from results"""
        return [result.time_score for result in all_results if result.time_score]
    
    def _recalculate_single_result(self, result, activity_instance, max_points, db: Session):
        """Recalculate score for a single result with max points"""
        modifiers = {
            'extra_shots': result.extra_shots,
            'penalties': result.penalties
        }
        result.final_score = activity_instance.apply_modifiers(
            max_points,
            modifiers,
            db
        )
    
    def _recalculate_with_ranking(self, result, activity_instance, all_times, db: Session):
        """Recalculate score using relative ranking"""
        if not result.time_score or not hasattr(activity_instance, 'calculate_relative_ranking_score'):
            return
        
        ranking_score = activity_instance.calculate_relative_ranking_score(
            all_times,
            result.time_score
        )
        
        modifiers = {
            'extra_shots': result.extra_shots,
            'penalties': result.penalties
        }
        result.final_score = activity_instance.apply_modifiers(ranking_score, modifiers, db)
    
    def _recalculate_all_results_for_activity(self, db: Session, activity_id: int) -> None:
        """Recalculate all results for a time-based activity when a new result is added"""
        activity, _ = self._validate_time_based_activity(db, activity_id)
        if not activity:
            return
        
        # Get all results for this activity
        all_results = db.query(ActivityResult).filter(
            ActivityResult.activity_id == activity_id,
            ActivityResult.is_completed == True
        ).all()
        
        if not all_results:
            return
        
        # Get all times
        all_times = self._get_all_completed_times(all_results)
        
        # Create activity instance
        activity_instance = ActivityFactory.create_activity(
            activity.activity_type,
            activity.config
        )
        
        # Recalculate scores
        if len(all_times) <= 1:
            # Only one result, give it max points
            max_points = activity_instance.config.get('max_points', 100)
            for result in all_results:
                self._recalculate_single_result(result, activity_instance, max_points, db)
        else:
            # Multiple results - use ranking
            for result in all_results:
                self._recalculate_with_ranking(result, activity_instance, all_times, db)
        
        # Commit and update team scores
        db.commit()
        affected_team_ids = {r.team_id for r in all_results}
        for team_id in affected_team_ids:
            self._update_team_scores(db, team_id)
    
    def _update_team_scores(self, db: Session, team_id: int) -> None:
        """Update team scores after activity result changes"""
        from app.services.scoring_service import ScoringService
        scoring_service = ScoringService(db)
        scoring_service.update_team_scores(team_id)
    
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
    
    def get_all(self, db: Session) -> List[ActivityResult]:
        """Get all activity results"""
        return db.query(ActivityResult).order_by(desc(ActivityResult.completed_at)).all()
    
    def update(self, db: Session, *, db_obj: ActivityResult, obj_in: ActivityResultUpdate) -> ActivityResult:
        """Update an activity result"""
        update_data = obj_in.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        
        # Recalculate final score if result data changed
        if 'result_data' in update_data:
            self._recalculate_score_for_update(db, db_obj)
            
            # If this is a TimeBasedActivity, recalculate all results
            activity = db.query(Activity).filter(Activity.id == db_obj.activity_id).first()
            if activity and activity.activity_type == 'TimeBasedActivity':
                self._recalculate_all_results_for_activity(db, activity.id)
        
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        
        # Update team scores after updating result
        self._update_team_scores(db, db_obj.team_id)
        
        return db_obj
    
    def _recalculate_score_for_update(self, db: Session, db_obj: ActivityResult) -> None:
        """Recalculate the final score when result data is updated"""
        activity = db.query(Activity).filter(Activity.id == db_obj.activity_id).first()
        activity_instance = ActivityFactory.create_activity(
            activity.activity_type, 
            activity.config
        )
        
        team = db.query(Team).filter(Team.id == db_obj.team_id).first()
        team_size = len(team.members) if team and team.members else 1
        
        base_score = activity_instance.calculate_score(db_obj.result_data, team_size)
        modifiers = {
            'extra_shots': db_obj.extra_shots,
            'penalties': db_obj.penalties
        }
        db_obj.final_score = activity_instance.apply_modifiers(base_score, modifiers, db)
    
    def remove(self, db: Session, *, id: int) -> Optional[ActivityResult]:
        """Remove an activity result"""
        obj = db.query(ActivityResult).get(id)
        if obj is None:
            return None
        
        team_id = obj.team_id  # Store team_id before deletion
        db.delete(obj)
        db.commit()
        
        # Update team scores after removing result
        from app.services.scoring_service import ScoringService
        scoring_service = ScoringService(db)
        scoring_service.update_team_scores(team_id)
        
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
    
    def remove(self, db: Session, *, id: int) -> Optional[RallyEvent]:
        """Remove a rally event"""
        obj = db.query(RallyEvent).get(id)
        if obj is None:
            return None
        db.delete(obj)
        db.commit()
        return obj


# Create instances
activity = CRUDActivity()
activity_result = CRUDActivityResult()
rally_event = CRUDRallyEvent()
