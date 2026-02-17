"""
Utility functions for staff evaluation endpoints

This module contains helper functions for:
- Serialization of activity and team data
- Permission validation
- Team checkpoint progression and advancement
- Checkpoint progress calculation
"""
from typing import Optional, Dict, Any, Tuple, List, Sequence
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from loguru import logger

from app.models.activity import ActivityResult, Activity
from app.models.team import Team
from app.schemas.user import DetailedUser
from app.schemas.activity import ActivityResultCreate, ActivityResultEvaluation
from app.api.auth import AuthData
from app.crud.crud_activity import activity_result
from app.crud.crud_team import team

# Error message constants
NO_CHECKPOINT_ASSIGNED = "No checkpoint assigned to this staff member"
TEAM_NOT_FOUND = "Team not found"


# =============================================================================
# Serialization Functions
# =============================================================================

def serialize_activity(result: ActivityResult) -> Optional[Dict[str, Any]]:
    """Helper function to serialize activity information"""
    if result.activity:
        return {
            "id": result.activity.id,
            "name": result.activity.name,
            "activity_type": result.activity.activity_type,
            "checkpoint_id": result.activity.checkpoint_id,
            "description": result.activity.description,
            "config": result.activity.config,
            "is_active": result.activity.is_active,
        }
    return None


def serialize_team(result: ActivityResult) -> Optional[Dict[str, Any]]:
    """Helper function to serialize team information including member count"""
    if result.team:
        return {
            "id": result.team.id,
            "name": result.team.name,
            "total": result.team.total,
            "num_members": len(result.team.members) if result.team.members else 0,
        }
    return None


# =============================================================================
# Permission Validation
# =============================================================================

def validate_rally_permissions(auth: AuthData) -> bool:
    """Validate that user has rally permissions"""
    return any(scope in auth.scopes for scope in ["rally-staff", "manager-rally", "admin"])


def is_admin_or_manager(auth: AuthData) -> bool:
    """Check if user is admin or manager"""
    return any(scope in auth.scopes for scope in ["manager-rally", "admin"])


def validate_staff_checkpoint_access(
    db: Session, current_user: DetailedUser, team_id: int, activity_id: int
) -> Tuple[Team, Activity]:
    """Validate staff checkpoint access and return team and activity objects"""
    logger.info(
        f"Validating staff access: user_id={current_user.id}, "
        f"staff_checkpoint_id={current_user.staff_checkpoint_id}, "
        f"team_id={team_id}, activity_id={activity_id}"
    )
    
    if not current_user.staff_checkpoint_id:
        logger.error(f"User {current_user.id} has no checkpoint assignment")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=NO_CHECKPOINT_ASSIGNED
        )
    
    # Verify team exists
    team_obj = team.get(db, id=team_id)
    if not team_obj:
        logger.error(f"Team {team_id} not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TEAM_NOT_FOUND
        )
    
    # NOTE: We don't check team checkpoint progress here.
    # Staff should be able to evaluate any team at their assigned checkpoint,
    # regardless of whether the team has been formally checked in yet.
    # The evaluation flow handles check-in automatically via
    # check_and_advance_team -> ensure_team_checkpoint_and_advance -> checkin_team_to_checkpoint
    team_checkpoint_number = len(team_obj.times)
    logger.info(
        f"Team {team_id} currently at checkpoint {team_checkpoint_number}, "
        f"staff assigned to checkpoint {current_user.staff_checkpoint_id}"
    )
    
    # Verify activity is at the same checkpoint
    from app.crud.crud_activity import activity
    activity_obj = activity.get(db, id=activity_id)
    if not activity_obj:
        logger.error(f"Activity {activity_id} not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )
    
    logger.info(f"Activity {activity_id} belongs to checkpoint {activity_obj.checkpoint_id}")
    
    if activity_obj.checkpoint_id != current_user.staff_checkpoint_id:
        logger.warning(
            f"Activity checkpoint mismatch: {activity_obj.checkpoint_id} != "
            f"{current_user.staff_checkpoint_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found at your assigned checkpoint"
        )
    
    logger.info(f"Validation successful for team {team_id}, activity {activity_id}")
    return team_obj, activity_obj


def validate_admin_access(db: Session, team_id: int, activity_id: int) -> Tuple[Team, Activity]:
    """Validate admin access and return team and activity objects"""
    team_obj = team.get(db, id=team_id)
    if not team_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TEAM_NOT_FOUND
        )
    
    from app.crud.crud_activity import activity
    activity_obj = activity.get(db, id=activity_id)
    if not activity_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )
    
    return team_obj, activity_obj


# =============================================================================
# Activity Result Management
# =============================================================================

def check_existing_result(db: Session, activity_id: int, team_id: int) -> None:
    """Check if result already exists for this team and activity"""
    existing_result = activity_result.get_by_activity_and_team(db, activity_id, team_id)
    if existing_result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Result already exists for this team and activity"
        )


def create_activity_result(
    db: Session, team_id: int, activity_id: int, result_in: ActivityResultEvaluation
) -> ActivityResult:
    """Create activity result"""
    result_create = ActivityResultCreate(
        team_id=team_id,
        activity_id=activity_id,
        result_data=result_in.result_data,
        extra_shots=result_in.extra_shots,
        penalties=result_in.penalties
    )
    return activity_result.create(db=db, obj_in=result_create)


# =============================================================================
# Team Checkpoint Progression
# =============================================================================

def check_and_advance_team(db: Session, team_id: int, activity_obj: Activity) -> None:
    """Check if team can advance to next checkpoint based on score accumulation"""
    current_checkpoint_id = activity_obj.checkpoint_id
    
    # Get all activity results for this team at current checkpoint with activity relationship loaded
    from sqlalchemy.orm import joinedload
    from sqlalchemy import select
    stmt = select(ActivityResult).options(
        joinedload(ActivityResult.activity)
    ).where(ActivityResult.team_id == team_id)
    team_results = list(db.scalars(stmt).unique().all())
    
    checkpoint_results = [
        r for r in team_results 
        if r.activity and r.activity.checkpoint_id == current_checkpoint_id and r.final_score is not None
    ]
    
    # If team has any scored results at this checkpoint, allow advancement
    # This permits teams to advance even if some activities were missed
    if checkpoint_results:
        logger.debug(
            f"Team {team_id} has {len(checkpoint_results)} scored results at "
            f"checkpoint {current_checkpoint_id}, advancing..."
        )
        ensure_team_checkpoint_and_advance(db, team_id, current_checkpoint_id)
    else:
        logger.debug(
            f"Team {team_id} has no scored results at checkpoint {current_checkpoint_id}, not advancing"
        )


def ensure_team_checkpoint_and_advance(db: Session, team_id: int, current_checkpoint_id: int) -> None:
    """Ensure team is checked into current checkpoint and advance to next"""
    team_obj = team.get(db, id=team_id)
    current_checkpoint_order = len(team_obj.times)
    
    # Convert checkpoint ID to order for comparison
    from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
    checkpoint_obj = checkpoint_crud.get(db, id=current_checkpoint_id)
    if not checkpoint_obj:
        return
    
    checkpoint_order = checkpoint_obj.order
    
    # If team hasn't been checked into current checkpoint yet, check them in first
    if current_checkpoint_order < checkpoint_order:
        checkin_team_to_checkpoint(db, team_id, current_checkpoint_id)
    
    # Now advance to next checkpoint
    advance_team_to_next_checkpoint(db, team_id)


def checkin_team_to_checkpoint(db: Session, team_id: int, checkpoint_id: int) -> None:
    """Check team into checkpoint with default scores"""
    from app.schemas.team import TeamScoresUpdate
    from app.crud.crud_team import team as team_crud
    
    checkin_scores = TeamScoresUpdate(
        checkpoint_id=checkpoint_id,
        question_score=0,  # Default score
        time_score=0,     # Default score
        pukes=0,          # Default
        skips=0           # Default
    )
    
    try:
        team_crud.add_checkpoint(db=db, id=team_id, checkpoint_id=checkpoint_id, obj_in=checkin_scores)
        logger.info(f"Checked team {team_id} into checkpoint {checkpoint_id}")
    except Exception as e:
        # Log error and propagate - checkpoint advancement is critical
        logger.error(f"Failed to check team {team_id} into checkpoint {checkpoint_id}: {e}")
        raise


def advance_team_to_next_checkpoint(db: Session, team_id: int) -> None:
    """Advance team to next checkpoint with default scores"""
    from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
    next_checkpoint = checkpoint_crud.get_next(db, team_id=team_id)
    if next_checkpoint:
        from app.schemas.team import TeamScoresUpdate
        from app.crud.crud_team import team as team_crud
        
        advance_scores = TeamScoresUpdate(
            checkpoint_id=next_checkpoint.id,
            question_score=0,  # Default score
            time_score=0,     # Default score
            pukes=0,          # Default
            skips=0           # Default
        )
        
        try:
            team_crud.add_checkpoint(db=db, id=team_id, checkpoint_id=next_checkpoint.id, obj_in=advance_scores)
            logger.info(f"Advanced team {team_id} to checkpoint {next_checkpoint.id}")
        except Exception as e:
            # Log error and propagate - checkpoint advancement failure should be visible
            logger.error(f"Failed to advance team {team_id} to checkpoint {next_checkpoint.id}: {e}")
            raise


# =============================================================================
# Checkpoint Progress Calculation
# =============================================================================

def compute_checkpoint_progress(db: Session, team_obj: Team) -> Tuple[int, int, List[int]]:
    """
    Calculate last and current checkpoint numbers plus completed orders for a team.
    """
    from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
    from app.crud.crud_activity import activity
    from app.crud.crud_activity import activity_result as activity_result_crud

    checkpoints = checkpoint_crud.get_all_ordered(db)
    team_results = activity_result_crud.get_by_team(db, team_id=team_obj.id)
    completed_activity_ids = {r.activity_id for r in team_results if getattr(r, "is_completed", False)}

    last_completed_order = 0
    completed_orders: list[int] = []
    for cp in checkpoints:
        # Skip checkpoints without activities, but continue to check later checkpoints
        if not checkpoint_has_activities(db, cp.id):
            continue

        if is_checkpoint_completed(db, cp.id, completed_activity_ids):
            last_completed_order = cp.order
            completed_orders.append(cp.order)
        else:
            # Stop at first incomplete checkpoint (teams must complete in order)
            break

    current_order = determine_current_order(checkpoints, last_completed_order)
    return last_completed_order, current_order, completed_orders


def checkpoint_has_activities(db: Session, checkpoint_id: int) -> bool:
    from app.crud.crud_activity import activity

    return bool(activity.get_by_checkpoint(db, checkpoint_id=checkpoint_id))


def is_checkpoint_completed(db: Session, checkpoint_id: int, completed_activity_ids: set[int]) -> bool:
    from app.crud.crud_activity import activity

    checkpoint_activities = activity.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
    if not checkpoint_activities:
        return False
    return all(act.id in completed_activity_ids for act in checkpoint_activities)


def determine_current_order(checkpoints: Sequence[Any], last_completed_order: int) -> int:
    if not checkpoints:
        return last_completed_order
    max_order = checkpoints[-1].order
    if last_completed_order < max_order:
        return last_completed_order + 1
    return last_completed_order


def build_team_for_staff(
    db: Session, team_obj: Team, staff_checkpoint_order: Optional[int] = None
) -> Dict[str, Any]:
    """Build team data for staff evaluation.
    last_checkpoint_number must reflect the last checkpoint where all activities
    for that checkpoint are completed by the team. It should not be derived
    from the number of activity timestamps, because a checkpoint can contain
    multiple activities. Compute both last and current consistently using
    activity completion per checkpoint.
    """

    last_checkpoint_number, current_checkpoint_number, completed_orders = compute_checkpoint_progress(db, team_obj)
    
    return {
        "id": team_obj.id,
        "name": team_obj.name,
        "total": team_obj.total,
        "classification": team_obj.classification,
        "versus_group_id": team_obj.versus_group_id,
        "num_members": len(team_obj.members) if team_obj.members else 0,
        "last_checkpoint_time": team_obj.times[-1] if team_obj.times else None,
        "last_checkpoint_score": team_obj.score_per_checkpoint[-1] if team_obj.score_per_checkpoint else None,
        "last_checkpoint_number": last_checkpoint_number,
        "current_checkpoint_number": current_checkpoint_number,
        "completed_checkpoint_numbers": completed_orders,
        "evaluated_at_current_checkpoint": (
            (staff_checkpoint_order in completed_orders) if staff_checkpoint_order else False
        ),
    }
