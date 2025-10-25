"""
API endpoints for activities management
"""
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.api.deps import get_db, get_current_user
from app.api.auth import AuthData, api_nei_auth
from app.api.abac_deps import require_permission
from app.schemas.user import DetailedUser
from app.core.abac import Action, Resource
from app.crud.crud_activity import activity, activity_result, rally_event
from app.models.activity import ActivityResult
from app.schemas.activity import (
    ActivityCreate, ActivityUpdate, ActivityResponse, ActivityListResponse,
    ActivityResultCreate, ActivityResultUpdate, ActivityResultResponse,
    RallyEventCreate, RallyEventUpdate, RallyEventResponse,
    ActivityRanking, GlobalRanking
)
from app.services.scoring_service import ScoringService
from app.models.activity_factory import ActivityFactory

# Error message constants
ACTIVITY_NOT_FOUND = "Activity not found"
ACTIVITY_RESULT_NOT_FOUND = "Activity result not found"

router = APIRouter()


@router.post("/", response_model=ActivityResponse)
def create_activity(
    *,
    db: Session = Depends(get_db),
    activity_in: ActivityCreate,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Create a new activity"""
    require_permission(current_user, auth, Action.CREATE_ACTIVITY, Resource.ACTIVITY)
    
    # Validate activity type and config
    try:
        default_config = ActivityFactory.get_default_config(activity_in.activity_type.value)
        
        # Merge with provided config
        final_config = {**default_config, **activity_in.config}
        activity_in.config = final_config
        
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid activity type"
        )
    
    db_activity = activity.create(db=db, obj_in=activity_in)
    return db_activity


@router.get("/", response_model=ActivityListResponse)
def get_activities(
    *,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    checkpoint_id: Optional[int] = Query(None, gt=0),
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get activities list"""
    require_permission(current_user, auth, Action.VIEW_ACTIVITY, Resource.ACTIVITY)
    
    if checkpoint_id:
        activities = activity.get_by_checkpoint(db, checkpoint_id)
        total = len(activities)
    else:
        activities = activity.get_multi(db, skip=skip, limit=limit)
        total = len(activities)
    
    return ActivityListResponse(
        activities=activities,
        total=total,
        page=skip // limit + 1,
        size=limit
    )


@router.get("/results", response_model=List[ActivityResultResponse])
def get_all_activity_results(
    *,
    db: Session = Depends(get_db),
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get all activity results (evaluations) with team and activity details"""
    # require_permission(current_user, auth, Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    # Get all activity results with related data
    from sqlalchemy.orm import joinedload
    results = db.query(ActivityResult).options(
        joinedload(ActivityResult.activity),
        joinedload(ActivityResult.team)
    ).order_by(desc(ActivityResult.completed_at)).all()
    
    return results


@router.get("/{activity_id}", response_model=ActivityResponse)
def get_activity(
    *,
    db: Session = Depends(get_db),
    activity_id: int,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get activity by ID"""
    require_permission(current_user, auth, Action.VIEW_ACTIVITY, Resource.ACTIVITY)
    
    db_activity = activity.get(db, id=activity_id)
    if not db_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_NOT_FOUND
        )
    
    return db_activity


@router.put("/{activity_id}", response_model=ActivityResponse)
def update_activity(
    *,
    db: Session = Depends(get_db),
    activity_id: int,
    activity_in: ActivityUpdate,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Update an activity"""
    require_permission(current_user, auth, Action.UPDATE_ACTIVITY, Resource.ACTIVITY)
    
    db_activity = activity.get(db, id=activity_id)
    if not db_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_NOT_FOUND
        )
    
    db_activity = activity.update(db=db, db_obj=db_activity, obj_in=activity_in)
    return db_activity


@router.delete("/{activity_id}")
def delete_activity(
    *,
    db: Session = Depends(get_db),
    activity_id: int,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Delete an activity"""
    require_permission(current_user, auth, Action.DELETE_ACTIVITY, Resource.ACTIVITY)
    
    db_activity = activity.get(db, id=activity_id)
    if not db_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_NOT_FOUND
        )
    
    activity.remove(db=db, id=activity_id)
    return {"message": "Activity deleted successfully"}


@router.post("/results/", response_model=ActivityResultResponse)
def create_activity_result(
    *,
    db: Session = Depends(get_db),
    result_in: ActivityResultCreate,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Create a new activity result"""
    require_permission(current_user, auth, Action.CREATE_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    # Check if result already exists
    existing_result = activity_result.get_by_activity_and_team(
        db, result_in.activity_id, result_in.team_id
    )
    if existing_result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Result already exists for this team and activity"
        )
    
    db_result = activity_result.create(db=db, obj_in=result_in)
    return db_result


@router.get("/results/{result_id}", response_model=ActivityResultResponse)
def get_activity_result(
    *,
    db: Session = Depends(get_db),
    result_id: int,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get activity result by ID"""
    require_permission(current_user, auth, Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    db_result = activity_result.get(db, id=result_id)
    if not db_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_RESULT_NOT_FOUND
        )
    
    return db_result


@router.put("/results/{result_id}", response_model=ActivityResultResponse)
def update_activity_result(
    *,
    db: Session = Depends(get_db),
    result_id: int,
    result_in: ActivityResultUpdate,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Update an activity result"""
    require_permission(current_user, auth, Action.UPDATE_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    db_result = activity_result.get(db, id=result_id)
    if not db_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_RESULT_NOT_FOUND
        )
    
    db_result = activity_result.update(db=db, db_obj=db_result, obj_in=result_in)
    return db_result


@router.post("/results/{result_id}/extra-shots")
def apply_extra_shots(
    *,
    db: Session = Depends(get_db),
    result_id: int,
    extra_shots: int = Query(..., ge=0),
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Apply extra shots bonus to activity result"""
    require_permission(current_user, auth, Action.UPDATE_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    db_result = activity_result.get(db, id=result_id)
    if not db_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_RESULT_NOT_FOUND
        )
    
    scoring_service = ScoringService(db)
    success = scoring_service.apply_extra_shots_bonus(
        db_result.team_id, db_result.activity_id, extra_shots
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid extra shots amount or team not found"
        )
    
    return {"message": "Extra shots bonus applied successfully"}


@router.post("/results/{result_id}/penalty")
def apply_penalty(
    *,
    db: Session = Depends(get_db),
    result_id: int,
    penalty_type: str = Query(..., regex="^(vomit|not_drinking|other)$"),
    penalty_value: int = Query(..., ge=1),
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Apply penalty to activity result"""
    require_permission(current_user, auth, Action.UPDATE_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    db_result = activity_result.get(db, id=result_id)
    if not db_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_RESULT_NOT_FOUND
        )
    
    scoring_service = ScoringService(db)
    success = scoring_service.apply_penalty(
        db_result.team_id, db_result.activity_id, penalty_type, penalty_value
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to apply penalty"
        )
    
    return {"message": "Penalty applied successfully"}


@router.get("/{activity_id}/ranking", response_model=ActivityRanking)
def get_activity_ranking(
    *,
    db: Session = Depends(get_db),
    activity_id: int,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get ranking for a specific activity"""
    require_permission(current_user, auth, Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    db_activity = activity.get(db, id=activity_id)
    if not db_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_NOT_FOUND
        )
    
    scoring_service = ScoringService(db)
    rankings = scoring_service.get_team_ranking(activity_id)
    
    return ActivityRanking(
        activity_id=activity_id,
        activity_name=db_activity.name,
        rankings=rankings
    )


@router.get("/ranking/global", response_model=GlobalRanking)
def get_global_ranking(
    *,
    db: Session = Depends(get_db),
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get global team ranking"""
    require_permission(current_user, auth, Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    scoring_service = ScoringService(db)
    rankings = scoring_service.get_team_ranking()
    
    return GlobalRanking(
        rankings=rankings,
        last_updated=datetime.now(timezone.utc)
    )


@router.post("/team-vs/{activity_id}")
def create_team_vs_result(
    *,
    db: Session = Depends(get_db),
    activity_id: int,
    team1_id: int,
    team2_id: int,
    winner_id: int,  # 0 for draw
    match_data: Dict[str, Any],
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Create team vs team activity results"""
    require_permission(current_user, auth, Action.CREATE_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    scoring_service = ScoringService(db)
    success, message = scoring_service.create_team_vs_result(
        team1_id, team2_id, activity_id, winner_id, match_data
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {"message": message}


@router.get("/{activity_id}/statistics")
def get_activity_statistics(
    *,
    db: Session = Depends(get_db),
    activity_id: int,
    current_user: DetailedUser = Depends(get_current_user),
    auth: AuthData = Depends(api_nei_auth)
):
    """Get statistics for a specific activity"""
    require_permission(current_user, auth, Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)
    
    db_activity = activity.get(db, id=activity_id)
    if not db_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_NOT_FOUND
        )
    
    scoring_service = ScoringService(db)
    statistics = scoring_service.get_activity_statistics(activity_id)
    
    return statistics

