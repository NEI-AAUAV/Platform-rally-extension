"""
API endpoints for staff evaluation system
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.api.auth import AuthData, api_nei_auth
from app.api.abac_deps import require_permission, get_staff_with_checkpoint_access
from app.schemas.user import DetailedUser
from app.core.abac import Action, Resource
from app.crud.crud_activity import activity_result
from app.crud.crud_team import team
from app.crud.crud_checkpoint import checkpoint
from app.schemas.activity import ActivityResultCreate, ActivityResultUpdate, ActivityResultResponse, ActivityResultEvaluation
from app.schemas.team import ListingTeam
from app.schemas.checkpoint import DetailedCheckPoint
from app.models.activity import ActivityResult
from app.models.team import Team

router = APIRouter()

# Error message constants
NO_CHECKPOINT_ASSIGNED = "No checkpoint assigned to this staff member"
TEAM_NOT_FOUND = "Team not found"
TEAM_NOT_FOUND_AT_CHECKPOINT = "Team not found at your assigned checkpoint"


def _serialize_activity(result) -> dict:
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


def _serialize_team(result) -> dict:
    """Helper function to serialize team information"""
    if result.team:
        return {
            "id": result.team.id,
            "name": result.team.name,
            "total": result.team.total,
        }
    return None


def _validate_rally_permissions(auth: AuthData) -> bool:
    """Validate that user has rally permissions"""
    return any(scope in auth.scopes for scope in ["rally-staff", "manager-rally", "admin"])


def _is_admin_or_manager(auth: AuthData) -> bool:
    """Check if user is admin or manager"""
    return any(scope in auth.scopes for scope in ["manager-rally", "admin"])


def _validate_staff_checkpoint_access(db: Session, current_user: DetailedUser, team_id: int, activity_id: int) -> tuple:
    """Validate staff checkpoint access and return team and activity objects"""
    if not current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=NO_CHECKPOINT_ASSIGNED
        )
    
    # Verify team is at the staff member's checkpoint
    team_obj = team.get(db, id=team_id)
    if not team_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TEAM_NOT_FOUND
        )
    
    # Allow staff to evaluate teams at their checkpoint or previous checkpoints
    # Block teams at future checkpoints
    team_checkpoint_number = len(team_obj.times)
    if team_checkpoint_number > current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team is at checkpoint {team_checkpoint_number}, but you can only evaluate teams at checkpoint {current_user.staff_checkpoint_id} or previous checkpoints"
        )
    
    # Verify activity is at the same checkpoint
    from app.crud.crud_activity import activity
    activity_obj = activity.get(db, id=activity_id)
    if not activity_obj or activity_obj.checkpoint_id != current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found at your assigned checkpoint"
        )
    
    return team_obj, activity_obj


def _validate_admin_access(db: Session, team_id: int, activity_id: int) -> tuple:
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


def _check_existing_result(db: Session, activity_id: int, team_id: int) -> None:
    """Check if result already exists for this team and activity"""
    existing_result = activity_result.get_by_activity_and_team(db, activity_id, team_id)
    if existing_result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Result already exists for this team and activity"
        )


def _create_activity_result(db: Session, team_id: int, activity_id: int, result_in: ActivityResultEvaluation) -> ActivityResult:
    """Create activity result"""
    result_create = ActivityResultCreate(
        team_id=team_id,
        activity_id=activity_id,
        result_data=result_in.result_data,
        extra_shots=result_in.extra_shots,
        penalties=result_in.penalties
    )
    return activity_result.create(db=db, obj_in=result_create)


def _check_and_advance_team(db: Session, team_id: int, activity_obj) -> None:
    """Check if team can advance to next checkpoint based on score accumulation"""
    current_checkpoint_id = activity_obj.checkpoint_id
    from app.crud.crud_activity import activity
    
    # Get all activity results for this team at current checkpoint
    team_results = activity_result.get_by_team(db, team_id=team_id)
    checkpoint_results = [
        r for r in team_results 
        if r.activity and r.activity.checkpoint_id == current_checkpoint_id and r.final_score is not None
    ]
    
    # If team has any scored results at this checkpoint, allow advancement
    # This permits teams to advance even if some activities were missed
    if checkpoint_results:
        _ensure_team_checkpoint_and_advance(db, team_id, current_checkpoint_id)


def _ensure_team_checkpoint_and_advance(db: Session, team_id: int, current_checkpoint_id: int) -> None:
    """Ensure team is checked into current checkpoint and advance to next"""
    team_obj = team.get(db, id=team_id)
    current_checkpoint_number = len(team_obj.times)
    
    # If team hasn't been checked into current checkpoint yet, check them in first
    if current_checkpoint_number < current_checkpoint_id:
        _checkin_team_to_checkpoint(db, team_id, current_checkpoint_id)
    
    # Now advance to next checkpoint
    _advance_team_to_next_checkpoint(db, team_id)


def _checkin_team_to_checkpoint(db: Session, team_id: int, checkpoint_id: int) -> None:
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
        print(f"Checked team {team_id} into checkpoint {checkpoint_id}")
    except Exception as e:
        print(f"Failed to check team {team_id} into checkpoint {checkpoint_id}: {e}")


def _advance_team_to_next_checkpoint(db: Session, team_id: int) -> None:
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
            print(f"Advanced team {team_id} to checkpoint {next_checkpoint.id}")
        except Exception as e:
            # Log error but don't fail the evaluation
            print(f"Failed to advance team {team_id} to checkpoint {next_checkpoint.id}: {e}")


@router.get("/my-checkpoint", response_model=DetailedCheckPoint)
def get_my_checkpoint(
    *,
    db: Session = Depends(get_db),
    current_user: DetailedUser = Depends(get_staff_with_checkpoint_access),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get the checkpoint assigned to the current staff member"""
    if not current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=NO_CHECKPOINT_ASSIGNED
        )
    
    checkpoint_obj = checkpoint.get(db, id=current_user.staff_checkpoint_id)
    if not checkpoint_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned checkpoint not found"
        )
    
    return checkpoint_obj


@router.get("/teams")
def get_teams_at_my_checkpoint(
    *,
    db: Session = Depends(get_db),
    current_user: DetailedUser = Depends(get_staff_with_checkpoint_access),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get all teams at the staff member's assigned checkpoint"""
    if not current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=NO_CHECKPOINT_ASSIGNED
        )
    
    # Get all teams that staff can evaluate (at current checkpoint or previous checkpoints)
    # This allows staff to evaluate teams from previous checkpoints if they were missed
    from sqlalchemy import func, select
    teams_stmt = select(Team).where(func.cardinality(Team.times) <= current_user.staff_checkpoint_id)
    teams = db.scalars(teams_stmt).all()
    
    # Convert to the expected format
    teams_data = []
    for team_obj in teams:
        # Calculate last checkpoint number (where they last completed activities)
        last_checkpoint_number = len(team_obj.times) if team_obj.times else 0
        
        # Check if team has completed all activities at their last checkpoint
        from app.crud.crud_activity import activity
        if last_checkpoint_number > 0:
            # Get checkpoint ID from the team's times (we need to get the checkpoint object)
            # For now, we'll use the fact that we know checkpoint IDs and order are the same
            checkpoint_activities = activity.get_by_checkpoint(db, checkpoint_id=last_checkpoint_number)
            team_results = activity_result.get_by_team(db, team_id=team_obj.id)
            completed_at_checkpoint = [r for r in team_results if r.activity_id in [a.id for a in checkpoint_activities]]
            
            # If all activities are completed, they should be at the next checkpoint
            if len(completed_at_checkpoint) == len(checkpoint_activities) and checkpoint_activities:
                current_checkpoint_number = last_checkpoint_number + 1
            else:
                # Still at the current checkpoint
                current_checkpoint_number = last_checkpoint_number
        else:
            # No checkpoint visited yet, next is 1
            current_checkpoint_number = 1
        
        team_data = {
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
        }
        teams_data.append(team_data)
    
    return teams_data


@router.get("/teams/{team_id}/activities")
def get_team_activities_for_evaluation(
    *,
    db: Session = Depends(get_db),
    team_id: int,
    current_user: DetailedUser = Depends(get_staff_with_checkpoint_access),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get activities for a specific team that can be evaluated by this staff member"""
    if not current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=NO_CHECKPOINT_ASSIGNED
        )
    
    # Verify team is at the staff member's checkpoint
    team_obj = team.get(db, id=team_id)
    if not team_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TEAM_NOT_FOUND
        )
    
    # Explicitly load team members to ensure they're available
    from sqlalchemy.orm import joinedload
    from app.models.team import Team
    team_obj = db.query(Team).options(joinedload(Team.members)).filter(Team.id == team_id).first()
    if not team_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TEAM_NOT_FOUND
        )
    
    # Check if team is at the staff's checkpoint or a previous checkpoint
    # Staff can evaluate teams at their checkpoint or previous checkpoints
    team_checkpoint_number = len(team_obj.times)
    
    # Allow evaluation if:
    # 1. Team is at staff's checkpoint (team_checkpoint_number == staff_checkpoint_id)
    # 2. Team is at a previous checkpoint (team_checkpoint_number < staff_checkpoint_id)
    # Block evaluation if team is at a future checkpoint (team_checkpoint_number > staff_checkpoint_id)
    if team_checkpoint_number > current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team is at checkpoint {team_checkpoint_number}, but you can only evaluate teams at checkpoint {current_user.staff_checkpoint_id} or previous checkpoints"
        )
    
    # Log the evaluation context for debugging
    print(f"Staff {current_user.id} (checkpoint {current_user.staff_checkpoint_id}) evaluating team {team_id} (at checkpoint {team_checkpoint_number})")
    
    # Always show activities for the staff's assigned checkpoint
    # This allows staff to evaluate teams from previous checkpoints using their checkpoint activities
    from app.crud.crud_activity import activity
    activities = activity.get_by_checkpoint(db, checkpoint_id=current_user.staff_checkpoint_id)
    
    # Get existing results for this team
    existing_results = activity_result.get_by_team(db, team_id=team_id)
    result_map = {result.activity_id: result for result in existing_results}
    
    # Build response with evaluation status
    activities_with_status = []
    total_activities = len(activities)
    completed_activities = 0
    pending_activities = []
    
    for activity_obj in activities:
        has_result = activity_obj.id in result_map
        if has_result:
            completed_activities += 1
        
        activity_data = {
            "id": activity_obj.id,
            "name": activity_obj.name,
            "description": activity_obj.description,
            "activity_type": activity_obj.activity_type,
            "config": activity_obj.config,
            "is_active": activity_obj.is_active,
            "evaluation_status": "completed" if has_result else "pending",
            "existing_result": result_map.get(activity_obj.id)
        }
        activities_with_status.append(activity_data)
        
        if not has_result:
            pending_activities.append(activity_obj.name)
    
    # Calculate completion ratio
    has_incomplete = completed_activities < total_activities if total_activities > 0 else False
    
    return {
        "team": team_obj,
        "activities": activities_with_status,
        "evaluation_summary": {
            "total_activities": total_activities,
            "completed_activities": completed_activities,
            "pending_activities": len(pending_activities),
            "completion_rate": round((completed_activities / total_activities * 100) if total_activities > 0 else 0, 1),
            "has_incomplete": has_incomplete,
            "missing_activities": pending_activities
        }
    }


@router.post("/teams/{team_id}/activities/{activity_id}/evaluate", response_model=ActivityResultResponse)
def evaluate_team_activity(
    *,
    db: Session = Depends(get_db),
    team_id: int,
    activity_id: int,
    result_in: ActivityResultEvaluation,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Evaluate a team's performance in an activity"""
    # Check if user has rally permissions
    if not _validate_rally_permissions(auth):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have Rally permissions"
        )
    
    # Validate access based on user role
    is_admin_or_manager = _is_admin_or_manager(auth)
    if is_admin_or_manager:
        _, activity_obj = _validate_admin_access(db, team_id, activity_id)
    else:
        _, activity_obj = _validate_staff_checkpoint_access(db, current_user, team_id, activity_id)
    
    # Check if result already exists
    _check_existing_result(db, activity_id, team_id)
    
    # Create the result
    db_result = _create_activity_result(db, team_id, activity_id, result_in)
    
    # Check if team has completed all activities and advance if needed
    # Both staff and admins/managers can trigger advancement
    _check_and_advance_team(db, team_id, activity_obj)
    
    return db_result


@router.put("/teams/{team_id}/activities/{activity_id}/evaluate/{result_id}", response_model=ActivityResultResponse)
def update_team_activity_evaluation(
    *,
    db: Session = Depends(get_db),
    team_id: int,
    activity_id: int,
    result_id: int,
    result_in: ActivityResultUpdate,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Update a team's activity evaluation"""
    # Check if user has rally permissions
    has_rally_access = any(scope in auth.scopes for scope in ["rally-staff", "manager-rally", "admin"])
    if not has_rally_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have Rally permissions"
        )
    
    # For staff users, check checkpoint assignment
    is_admin_or_manager = any(scope in auth.scopes for scope in ["manager-rally", "admin"])
    if not is_admin_or_manager:
        if not current_user.staff_checkpoint_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=NO_CHECKPOINT_ASSIGNED
            )
        
        # Verify team is at the staff member's checkpoint
        team_obj = team.get(db, id=team_id)
        if not team_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=TEAM_NOT_FOUND
            )
        
        # Allow staff to evaluate teams at their assigned checkpoint, even if team has advanced
        # Check if team has visited the staff member's checkpoint (team can be at or past this checkpoint)
        team_checkpoint_number = len(team_obj.times)
        if team_checkpoint_number < current_user.staff_checkpoint_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=TEAM_NOT_FOUND_AT_CHECKPOINT
            )
    else:
        # For managers/admins, just verify team exists
        team_obj = team.get(db, id=team_id)
        if not team_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=TEAM_NOT_FOUND
            )
    
    # Get the result
    db_result = activity_result.get(db, id=result_id)
    if not db_result or db_result.activity_id != activity_id or db_result.team_id != team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity result not found"
        )
    
    # Update the result
    db_result = activity_result.update(db=db, db_obj=db_result, obj_in=result_in)
    return db_result


@router.get("/all-evaluations")
def get_all_evaluations(
    *,
    db: Session = Depends(get_db),
    checkpoint_id: Optional[int] = Query(None),
    team_id: Optional[int] = Query(None),
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get all evaluations - accessible by managers only"""
    require_permission(current_user, auth, Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    # Get all activity results
    from sqlalchemy.orm import joinedload
    query = db.query(ActivityResult).options(
        joinedload(ActivityResult.activity),
        joinedload(ActivityResult.team)
    )
    
    if team_id:
        # Filter by specific team
        query = query.filter(ActivityResult.team_id == team_id)
    elif checkpoint_id:
        # Get teams at specific checkpoint
        teams = team.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
        team_ids = [t.id for t in teams]
        
        # Get results for these teams
        from sqlalchemy import and_
        query = query.filter(ActivityResult.team_id.in_(team_ids))
    
    results = query.order_by(ActivityResult.completed_at.desc()).all()
    
    # Build response with team and activity details
    evaluations = []
    for result in results:
        evaluation_data = {
            "id": result.id,
            "activity_id": result.activity_id,
            "team_id": result.team_id,
            "result_data": result.result_data,
            "final_score": result.final_score,
            "is_completed": result.is_completed,
            "completed_at": result.completed_at,
            "created_at": result.created_at,
            "updated_at": result.updated_at,
            "activity": _serialize_activity(result) if result.activity else None,
            "team": _serialize_team(result) if result.team else None
        }
        evaluations.append(evaluation_data)
    
    return {
        "evaluations": evaluations,
        "total": len(evaluations)
    }
