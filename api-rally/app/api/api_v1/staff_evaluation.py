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


def _serialize_activity(result) -> Optional[dict]:
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


def _serialize_team(result) -> Optional[dict]:
    """Helper function to serialize team information including member count"""
    if result.team:
        return {
            "id": result.team.id,
            "name": result.team.name,
            "total": result.team.total,
            "num_members": len(result.team.members) if result.team.members else 0,
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
    
    # Allow staff to evaluate teams at their checkpoint or teams that have already passed it
    # Block teams that have not yet reached the staff's checkpoint
    team_checkpoint_number = len(team_obj.times)
    if team_checkpoint_number < current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team is at checkpoint {team_checkpoint_number}, but you can only evaluate teams at checkpoint {current_user.staff_checkpoint_id} or later (once they reach it)"
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
    current_checkpoint_order = len(team_obj.times)
    
    # Convert checkpoint ID to order for comparison
    from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
    checkpoint_obj = checkpoint_crud.get(db, id=current_checkpoint_id)
    if not checkpoint_obj:
        return
    
    checkpoint_order = checkpoint_obj.order
    
    # If team hasn't been checked into current checkpoint yet, check them in first
    if current_checkpoint_order < checkpoint_order:
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
    
    # Convert to the expected format, include evaluated_at_current_checkpoint helper
    return [
        _build_team_for_staff(db, team_obj, staff_checkpoint_order=current_user.staff_checkpoint_id)
        for team_obj in teams
    ]


def _build_team_for_staff(db: Session, team_obj: Team, staff_checkpoint_order: int | None = None) -> dict:
    """Build team data for staff evaluation.
    last_checkpoint_number must reflect the last checkpoint where all activities
    for that checkpoint are completed by the team. It should not be derived
    from the number of activity timestamps, because a checkpoint can contain
    multiple activities. Compute both last and current consistently using
    activity completion per checkpoint.
    """

    def _compute_checkpoint_progress(db: Session, team_obj: Team) -> tuple[int, int, list[int]]:
        # Import here to avoid circulars at module import time
        from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
        from app.crud.crud_activity import activity
        from app.crud.crud_activity import activity_result as activity_result_crud

        # Load ordered checkpoints and this team's results
        checkpoints = checkpoint_crud.get_all_ordered(db)
        team_results = activity_result_crud.get_by_team(db, team_id=team_obj.id)

        # Index results by activity_id for fast lookup of completed state
        completed_activity_ids = {r.activity_id for r in team_results if getattr(r, "is_completed", False)}

        last_completed_order = 0
        completed_orders: list[int] = []
        for cp in checkpoints:
            cp_activities = activity.get_by_checkpoint(db, checkpoint_id=cp.id)
            cp_activity_ids = [a.id for a in cp_activities]

            # If checkpoint has no activities, treat it as not completed and stop advancing
            if not cp_activity_ids:
                break

            # Completed when every activity has a completed result
            if all(aid in completed_activity_ids for aid in cp_activity_ids):
                last_completed_order = cp.order
                completed_orders.append(cp.order)
            else:
                break

        # Current checkpoint is the next one after the last fully completed, if it exists; otherwise the same
        max_order = checkpoints[-1].order if checkpoints else 0
        if last_completed_order < max_order:
            current_order = last_completed_order + 1
        else:
            current_order = last_completed_order

        return last_completed_order, current_order, completed_orders

    last_checkpoint_number, current_checkpoint_number, completed_orders = _compute_checkpoint_progress(db, team_obj)
    
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


def _calculate_current_checkpoint_for_staff(db: Session, team_obj: Team, last_checkpoint_number: int) -> int:
    """Calculate current checkpoint number for a team"""
    if last_checkpoint_number == 0:
        return 1
    
    # Get checkpoint by order, not by ID
    from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
    from app.crud.crud_activity import activity
    from app.crud.crud_activity import activity_result as activity_result_crud
    
    checkpoint_obj = checkpoint_crud.get_by_order(db, last_checkpoint_number)
    if not checkpoint_obj:
        return last_checkpoint_number
    
    # Use actual checkpoint ID to get activities
    checkpoint_activities = activity.get_by_checkpoint(db, checkpoint_id=checkpoint_obj.id)
    team_results = activity_result_crud.get_by_team(db, team_id=team_obj.id)
    completed_at_checkpoint = [r for r in team_results if r.activity_id in [a.id for a in checkpoint_activities]]
    
    # If all activities completed, move to next checkpoint
    if len(completed_at_checkpoint) == len(checkpoint_activities) and checkpoint_activities:
        return last_checkpoint_number + 1
    return last_checkpoint_number


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
    
    # Allow evaluation if team has reached the staff's checkpoint (>=) or is exactly at it
    # Block only when the team has not yet reached the staff's checkpoint (<)
    team_checkpoint_number = len(team_obj.times)
    if team_checkpoint_number < current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team is at checkpoint {team_checkpoint_number}, but you can only evaluate teams that have reached checkpoint {current_user.staff_checkpoint_id}"
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
    
    # Create or update the result if it already exists
    existing_result = activity_result.get_by_activity_and_team(db, activity_id, team_id)
    if existing_result:
        update_in = ActivityResultUpdate(
            result_data=result_in.result_data,
            extra_shots=result_in.extra_shots,
            penalties=result_in.penalties,
        )
        db_result = activity_result.update(db=db, db_obj=existing_result, obj_in=update_in)
    else:
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

        # Ensure the activity being updated belongs to the staff's checkpoint
        from app.crud.crud_activity import activity as activity_crud
        activity_obj = activity_crud.get(db, id=activity_id)
        if not activity_obj or activity_obj.checkpoint_id != current_user.staff_checkpoint_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Activity not found at your assigned checkpoint"
            )

        # We intentionally do NOT block updates if the team has advanced to a later checkpoint
        # as long as the result belongs to this team and this activity at the staff's checkpoint.
        team_obj = team.get(db, id=team_id)
        if not team_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=TEAM_NOT_FOUND
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
        joinedload(ActivityResult.team).joinedload(Team.members)
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
            "extra_shots": result.extra_shots,
            "penalties": result.penalties,
            "time_score": result.time_score,
            "points_score": result.points_score,
            "boolean_score": result.boolean_score,
            "activity": _serialize_activity(result) if result.activity else None,
            "team": _serialize_team(result) if result.team else None
        }
        evaluations.append(evaluation_data)
    
    return {
        "evaluations": evaluations,
        "total": len(evaluations)
    }
