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

router = APIRouter()


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
            detail="No checkpoint assigned to this staff member"
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
            detail="No checkpoint assigned to this staff member"
        )
    
    teams = team.get_by_checkpoint(db, checkpoint_id=current_user.staff_checkpoint_id)
    
    # Convert to the expected format
    teams_data = []
    for team_obj in teams:
        team_data = {
            "id": team_obj.id,
            "name": team_obj.name,
            "total": team_obj.total,
            "classification": team_obj.classification,
            "versus_group_id": team_obj.versus_group_id,
            "num_members": len(team_obj.members) if team_obj.members else 0,
            "last_checkpoint_time": team_obj.times[-1] if team_obj.times else None,
            "last_checkpoint_score": team_obj.score_per_checkpoint[-1] if team_obj.score_per_checkpoint else None,
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
            detail="No checkpoint assigned to this staff member"
        )
    
    # Verify team is at the staff member's checkpoint
    team_obj = team.get(db, id=team_id)
    if not team_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    # Check if team is at the correct checkpoint (teams at checkpoint N have visited N checkpoints)
    team_checkpoint_number = len(team_obj.times)
    if team_checkpoint_number != current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found at your assigned checkpoint"
        )
    
    # Get activities for this checkpoint
    from app.crud.crud_activity import activity
    activities = activity.get_by_checkpoint(db, checkpoint_id=current_user.staff_checkpoint_id)
    
    # Get existing results for this team
    existing_results = activity_result.get_by_team(db, team_id=team_id)
    result_map = {result.activity_id: result for result in existing_results}
    
    # Build response with evaluation status
    activities_with_status = []
    for activity_obj in activities:
        activity_data = {
            "id": activity_obj.id,
            "name": activity_obj.name,
            "description": activity_obj.description,
            "activity_type": activity_obj.activity_type,
            "config": activity_obj.config,
            "is_active": activity_obj.is_active,
            "order": activity_obj.order,
            "evaluation_status": "completed" if activity_obj.id in result_map else "pending",
            "existing_result": result_map.get(activity_obj.id)
        }
        activities_with_status.append(activity_data)
    
    return {
        "team": team_obj,
        "activities": activities_with_status
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
                detail="No checkpoint assigned to this staff member"
            )
        
        # Verify team is at the staff member's checkpoint
        team_obj = team.get(db, id=team_id)
        if not team_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )
        
        # Allow staff to evaluate teams at their assigned checkpoint, even if team has advanced
        # Check if team has visited the staff member's checkpoint (team can be at or past this checkpoint)
        team_checkpoint_number = len(team_obj.times)
        if team_checkpoint_number < current_user.staff_checkpoint_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found at your assigned checkpoint"
            )
        
        # Verify activity is at the same checkpoint
        from app.crud.crud_activity import activity
        activity_obj = activity.get(db, id=activity_id)
        if not activity_obj or activity_obj.checkpoint_id != current_user.staff_checkpoint_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Activity not found at your assigned checkpoint"
            )
    else:
        # For managers/admins, just verify team and activity exist
        team_obj = team.get(db, id=team_id)
        if not team_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )
        
        from app.crud.crud_activity import activity
        activity_obj = activity.get(db, id=activity_id)
        if not activity_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Activity not found"
            )
    
    # Check if result already exists
    existing_result = activity_result.get_by_activity_and_team(db, activity_id, team_id)
    if existing_result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Result already exists for this team and activity"
        )
    
    # Create the result with team_id and activity_id
    result_create = ActivityResultCreate(
        team_id=team_id,
        activity_id=activity_id,
        result_data=result_in.result_data,
        extra_shots=result_in.extra_shots,
        penalties=result_in.penalties
    )
    
    db_result = activity_result.create(db=db, obj_in=result_create)
    
    # Check if team has completed all activities at current checkpoint
    # and automatically advance them to next checkpoint
    if is_admin_or_manager:
        # For managers/admins, check if team completed all activities at current checkpoint
        current_checkpoint_id = activity_obj.checkpoint_id
        from app.crud.crud_activity import activity
        all_checkpoint_activities = activity.get_by_checkpoint(db, checkpoint_id=current_checkpoint_id)
        team_results = activity_result.get_by_team(db, team_id=team_id)
        completed_activities = [r.activity_id for r in team_results if r.activity_id in [a.id for a in all_checkpoint_activities]]
        
        # If team completed all activities at current checkpoint, advance them
        if len(completed_activities) == len(all_checkpoint_activities):
            # First, ensure team is checked into current checkpoint
            team_obj = team.get(db, id=team_id)
            current_checkpoint_number = len(team_obj.times)
            
            # If team hasn't been checked into current checkpoint yet, check them in first
            if current_checkpoint_number < current_checkpoint_id:
                from app.schemas.team import TeamScoresUpdate
                from app.crud.crud_team import team as team_crud
                
                checkin_scores = TeamScoresUpdate(
                    checkpoint_id=current_checkpoint_id,
                    question_score=0,  # Default score
                    time_score=0,     # Default score
                    pukes=0,          # Default
                    skips=0           # Default
                )
                
                try:
                    team_crud.add_checkpoint(db=db, id=team_id, checkpoint_id=current_checkpoint_id, obj_in=checkin_scores)
                    print(f"Checked team {team_id} into checkpoint {current_checkpoint_id}")
                except Exception as e:
                    print(f"Failed to check team {team_id} into checkpoint {current_checkpoint_id}: {e}")
            
            # Now advance to next checkpoint
            from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
            next_checkpoint = checkpoint_crud.get_next(db, team_id=team_id)
            if next_checkpoint:
                # Advance team to next checkpoint with default scores
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
                detail="No checkpoint assigned to this staff member"
            )
        
        # Verify team is at the staff member's checkpoint
        team_obj = team.get(db, id=team_id)
        if not team_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )
        
        # Allow staff to evaluate teams at their assigned checkpoint, even if team has advanced
        # Check if team has visited the staff member's checkpoint (team can be at or past this checkpoint)
        team_checkpoint_number = len(team_obj.times)
        if team_checkpoint_number < current_user.staff_checkpoint_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found at your assigned checkpoint"
            )
    else:
        # For managers/admins, just verify team exists
        team_obj = team.get(db, id=team_id)
        if not team_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
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
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get all evaluations - accessible by managers only"""
    require_permission(current_user, auth, Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    # Get all activity results
    if checkpoint_id:
        # Get teams at specific checkpoint
        teams = team.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
        team_ids = [t.id for t in teams]
        
        # Get results for these teams
        from sqlalchemy import and_
        results = db.query(ActivityResult).filter(
            ActivityResult.team_id.in_(team_ids)
        ).all()
    else:
        # Get all results
        results = db.query(ActivityResult).all()
    
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
            "activity": result.activity,
            "team": result.team
        }
        evaluations.append(evaluation_data)
    
    return {
        "evaluations": evaluations,
        "total": len(evaluations)
    }
