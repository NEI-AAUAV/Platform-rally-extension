"""
API endpoints for staff evaluation system
"""
from typing import Annotated, List, Optional, Dict, Any, TypedDict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.orm import Session
from loguru import logger

from app.api.deps import get_db, get_current_user
from app.api.auth import AuthData, api_nei_auth
from app.api.abac_deps import require_permission, get_staff_with_checkpoint_access
from app.schemas.user import DetailedUser
from app.core.abac import Action, Resource
from app.crud.crud_activity import activity_result
from app.crud.crud_team import team
from app.crud.crud_checkpoint import checkpoint
from app.schemas.activity import ActivityResultCreate, ActivityResultUpdate, ActivityResultResponse, ActivityResultEvaluation
from app.schemas.checkpoint import DetailedCheckPoint
from app.models.activity import ActivityResult, Activity
from app.models.team import Team

# Import utility functions
from app.api.api_v1.staff_evaluation_utils import (
    serialize_activity,
    serialize_team,
    validate_rally_permissions,
    is_admin_or_manager,
    validate_staff_checkpoint_access,
    validate_admin_access,
    check_existing_result,
    create_activity_result,
    check_and_advance_team,
    build_team_for_staff,
    NO_CHECKPOINT_ASSIGNED,
    TEAM_NOT_FOUND,
)

router = APIRouter()

# Error message constants
TEAM_NOT_FOUND_AT_CHECKPOINT = "Team not found at your assigned checkpoint"




@router.get("/my-checkpoint")
def get_my_checkpoint(
    *,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> DetailedCheckPoint:
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
    
    # Cast to DetailedCheckPoint for response model compatibility
    return DetailedCheckPoint.model_validate(checkpoint_obj)


@router.get("/teams")
def get_teams_at_my_checkpoint(
    *,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> List[Dict[str, Any]]:
    """Get all teams at the staff member's assigned checkpoint"""
    if not current_user.staff_checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=NO_CHECKPOINT_ASSIGNED
        )
    
    # Fetch the checkpoint's order (not the FK id) for correct comparison
    from sqlalchemy import select
    checkpoint_obj = checkpoint.get(db, id=current_user.staff_checkpoint_id)
    if not checkpoint_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned checkpoint not found"
        )
    staff_checkpoint_order = checkpoint_obj.order

    # Get all teams that staff can evaluate (at current checkpoint or previous checkpoints)
    # Filter by number of completed checkpoints (cardinality of times) <= staff's checkpoint order
    from sqlalchemy import func
    teams_stmt = select(Team).where(func.cardinality(Team.times) <= staff_checkpoint_order)
    teams = db.scalars(teams_stmt).all()

    # Convert to the expected format using the utils function
    return [
        build_team_for_staff(db, team_obj, staff_checkpoint_order=staff_checkpoint_order)
        for team_obj in teams
    ]


@router.get("/teams/{team_id}/activities")
def get_team_activities_for_evaluation(
    *,
    db: Annotated[Session, Depends(get_db)],
    team_id: int,
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> Dict[str, Any]:
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
    from sqlalchemy import select
    from app.models.team import Team
    stmt = select(Team).options(joinedload(Team.members)).where(Team.id == team_id)
    # Use unique() to deduplicate joined rows when team has multiple members
    team_obj_with_members: Optional[Team] = db.scalars(stmt).unique().first()
    if not team_obj_with_members:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TEAM_NOT_FOUND
        )
    team_obj = team_obj_with_members
    
    # NOTE: We don't check team checkpoint progress here.
    # Staff should be able to evaluate any team at their assigned checkpoint,
    # regardless of whether the team has formally reached it yet.
    # This allows for error recovery scenarios where teams need manual evaluation.
    team_checkpoint_number = len(team_obj.times)
    logger.debug(f"Staff {current_user.id} (checkpoint {current_user.staff_checkpoint_id}) evaluating team {team_id} (at checkpoint {team_checkpoint_number})")
    
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


@router.post("/teams/{team_id}/activities/{activity_id}/evaluate")
def evaluate_team_activity(
    *,
    team_id: int,
    activity_id: int,
    result_in: ActivityResultEvaluation,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> ActivityResultResponse:
    """Evaluate a team's performance in an activity"""
    logger.info(f"Evaluation request: team_id={team_id}, activity_id={activity_id}, user_id={current_user.id}, scopes={auth.scopes}")
    logger.debug(f"Received result_in: result_data={result_in.result_data}, extra_shots={result_in.extra_shots}, penalties={result_in.penalties}")
    
    # Check if user has rally permissions
    if not validate_rally_permissions(auth):
        logger.warning(f"User {current_user.id} does not have Rally permissions")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have Rally permissions"
        )
    
    # Validate access based on user role
    is_admin_or_manager_flag = is_admin_or_manager(auth)
    logger.debug(f"User {current_user.id} is_admin_or_manager={is_admin_or_manager_flag}, staff_checkpoint_id={current_user.staff_checkpoint_id}")
    
    try:
        if is_admin_or_manager_flag:
            _, activity_obj = validate_admin_access(db, team_id, activity_id)
        else:
            _, activity_obj = validate_staff_checkpoint_access(db, current_user, team_id, activity_id)
        logger.debug(f"Access validated: activity_id={activity_obj.id}, checkpoint_id={activity_obj.checkpoint_id}")
    except HTTPException as e:
        logger.error(f"Access validation failed: {e.status_code} - {e.detail}")
        raise
    
    # Create or update the result if it already exists
    existing_result = activity_result.get_by_activity_and_team(db, activity_id, team_id)
    if existing_result:
        logger.info(f"Updating existing result {existing_result.id} for team {team_id}, activity {activity_id}")
        update_in = ActivityResultUpdate(
            result_data=result_in.result_data,
            extra_shots=result_in.extra_shots,
            penalties=result_in.penalties,
        )
        try:
            db_result = activity_result.update(db=db, db_obj=existing_result, obj_in=update_in)
            logger.info(f"Successfully updated result {db_result.id}")
        except Exception as e:
            logger.error(f"Failed to update result: {str(e)}", exc_info=True)
            raise
    else:
        logger.info(f"Creating new result for team {team_id}, activity {activity_id}")
        try:
            db_result = create_activity_result(db, team_id, activity_id, result_in)
            logger.info(f"Successfully created result {db_result.id}")
        except Exception as e:
            logger.error(f"Failed to create result: {str(e)}", exc_info=True)
            raise
    
    # Check if team has completed all activities and advance if needed
    # Both staff and admins/managers can trigger advancement
    try:
        logger.debug(f"Checking if team {team_id} can advance after activity {activity_id}")
        check_and_advance_team(db, team_id, activity_obj)
    except Exception as e:
        logger.error(f"Failed to check/advance team: {str(e)}", exc_info=True)
        # Don't fail the evaluation if advancement fails - log and continue
        # The evaluation was successful, advancement is a side effect
    
    return ActivityResultResponse.model_validate(db_result)


@router.put("/teams/{team_id}/activities/{activity_id}/evaluate/{result_id}")
def update_team_activity_evaluation(
    *,
    db: Annotated[Session, Depends(get_db)],
    team_id: int,
    activity_id: int,
    result_id: int,
    result_in: ActivityResultUpdate,
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> ActivityResultResponse:
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
    return ActivityResultResponse.model_validate(db_result)


@router.get("/all-evaluations")
def get_all_evaluations(
    *,
    db: Annotated[Session, Depends(get_db)],
    checkpoint_id: Annotated[Optional[int], Query()] = None,
    team_id: Annotated[Optional[int], Query()] = None,
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> Dict[str, Any]:
    """Get all evaluations - accessible by staff (filtered by checkpoint) and managers (all data)"""
    # Check if user has rally permissions
    if not validate_rally_permissions(auth):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have Rally permissions"
        )
    
    # Staff members can only view evaluations from their assigned checkpoint
    # Managers/admins can view all evaluations
    is_manager = is_admin_or_manager(auth)
    
    # If user is staff (not manager/admin), restrict to their checkpoint
    if not is_manager:
        if not current_user.staff_checkpoint_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=NO_CHECKPOINT_ASSIGNED
            )
        # Override checkpoint_id filter with staff's assigned checkpoint
        checkpoint_id = current_user.staff_checkpoint_id
        logger.debug(f"Staff user {current_user.id} restricted to checkpoint {checkpoint_id}")
    
    # Get all activity results
    from sqlalchemy.orm import joinedload
    from sqlalchemy import select
    stmt = select(ActivityResult).options(
        joinedload(ActivityResult.activity),
        joinedload(ActivityResult.team)
    )
    
    if team_id:
        # Filter by specific team
        stmt = stmt.where(ActivityResult.team_id == team_id)
    elif checkpoint_id:
        # Get teams at specific checkpoint
        teams = team.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
        team_ids = [t.id for t in teams]
        
        # Get results for these teams
        stmt = stmt.where(ActivityResult.team_id.in_(team_ids))
    
    stmt = stmt.order_by(ActivityResult.completed_at.desc())
    results = list(db.scalars(stmt).all())
    
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
            "activity": serialize_activity(result) if result.activity else None,
            "team": serialize_team(result) if result.team else None
        }
        evaluations.append(evaluation_data)
    
    return {
        "evaluations": evaluations,
        "total": len(evaluations)
    }
