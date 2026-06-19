"""
API endpoints for activities management
"""
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, select

from app.api.deps import get_db
from app.api.abac_deps import require, Action, Resource
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
    _: None = Depends(require(Action.CREATE_ACTIVITY, Resource.ACTIVITY)),
) -> ActivityResponse:
    """Create a new activity"""
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
    return ActivityResponse.model_validate(db_activity)


@router.get("/", response_model=ActivityListResponse)
def get_activities(
    *,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    checkpoint_id: Optional[int] = Query(None, gt=0),
    _: None = Depends(require(Action.VIEW_ACTIVITY, Resource.ACTIVITY)),
) -> ActivityListResponse:
    """Get activities list"""
    if checkpoint_id:
        activities = activity.get_by_checkpoint(db, checkpoint_id)
        total = len(activities)
    else:
        activities = activity.get_multi(db, skip=skip, limit=limit)
        total = len(activities)
    
    return ActivityListResponse(
        activities=[ActivityResponse.model_validate(a) for a in activities],
        total=total,
        page=skip // limit + 1,
        size=limit
    )


@router.get("/results", response_model=List[ActivityResultResponse])
def get_all_activity_results(
    *,
    db: Session = Depends(get_db),
    _: None = Depends(require(Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)),
) -> List[ActivityResultResponse]:
    """Get all activity results (evaluations) with team and activity details"""
    # Get all activity results with related data
    from sqlalchemy.orm import joinedload
    stmt = select(ActivityResult).options(
        joinedload(ActivityResult.activity),
        joinedload(ActivityResult.team)
    ).order_by(desc(ActivityResult.completed_at))
    results = list(db.scalars(stmt).all())
    
    return [ActivityResultResponse.model_validate(r) for r in results]


@router.get("/{activity_id}", response_model=ActivityResponse)
def get_activity(
    *,
    db: Session = Depends(get_db),
    activity_id: int,
    _: None = Depends(require(Action.VIEW_ACTIVITY, Resource.ACTIVITY)),
) -> ActivityResponse:
    """Get activity by ID"""
    db_activity = activity.get(db, id=activity_id)
    if not db_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_NOT_FOUND
        )
    
    return ActivityResponse.model_validate(db_activity)


@router.put("/{activity_id}", response_model=ActivityResponse)
def update_activity(
    *,
    db: Session = Depends(get_db),
    activity_id: int,
    activity_in: ActivityUpdate,
    _: None = Depends(require(Action.UPDATE_ACTIVITY, Resource.ACTIVITY)),
) -> ActivityResponse:
    """Update an activity"""
    db_activity = activity.get(db, id=activity_id)
    if not db_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_NOT_FOUND
        )
    
    db_activity = activity.update(db=db, db_obj=db_activity, obj_in=activity_in)
    return ActivityResponse.model_validate(db_activity)


@router.delete("/{activity_id}")
def delete_activity(
    *,
    db: Session = Depends(get_db),
    activity_id: int,
    _: None = Depends(require(Action.DELETE_ACTIVITY, Resource.ACTIVITY)),
) -> Dict[str, str]:
    """Delete an activity"""
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
    _: None = Depends(require(Action.CREATE_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)),
) -> ActivityResultResponse:
    """Create a new activity result"""
    # Check if result already exists
    existing_result = activity_result.get_by_activity_and_team(
        db, result_in.activity_id, result_in.team_id
    )
    if existing_result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Result already exists for this team and activity"
        )
    
    db_result = ScoringService(db).create_result(result_in)
    return ActivityResultResponse.model_validate(db_result)


@router.get("/results/{result_id}", response_model=ActivityResultResponse)
def get_activity_result(
    *,
    db: Session = Depends(get_db),
    result_id: int,
    _: None = Depends(require(Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)),
) -> ActivityResultResponse:
    """Get activity result by ID"""
    db_result = activity_result.get(db, id=result_id)
    if not db_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_RESULT_NOT_FOUND
        )
    
    return ActivityResultResponse.model_validate(db_result)


@router.put("/results/{result_id}", response_model=ActivityResultResponse)
def update_activity_result(
    *,
    db: Session = Depends(get_db),
    result_id: int,
    result_in: ActivityResultUpdate,
    _: None = Depends(require(Action.UPDATE_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)),
) -> ActivityResultResponse:
    """Update an activity result"""
    db_result = activity_result.get(db, id=result_id)
    if not db_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_RESULT_NOT_FOUND
        )
    
    db_result = ScoringService(db).update_result(db_result, result_in)
    return ActivityResultResponse.model_validate(db_result)


@router.post("/results/{result_id}/extra-shots")
def apply_extra_shots(
    *,
    db: Session = Depends(get_db),
    result_id: int,
    extra_shots: int = Query(..., ge=0),
    _: None = Depends(require(Action.UPDATE_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)),
) -> Dict[str, str]:
    """Apply extra shots bonus to activity result"""
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
    _: None = Depends(require(Action.UPDATE_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)),
) -> Dict[str, str]:
    """Apply penalty to activity result"""
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
    _: None = Depends(require(Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)),
) -> ActivityRanking:
    """Get ranking for a specific activity"""
    db_activity = activity.get(db, id=activity_id)
    if not db_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_NOT_FOUND
        )
    
    scoring_service = ScoringService(db)
    rankings_dict = scoring_service.get_team_ranking(activity_id)
    
    from app.schemas.activity import TeamRanking
    # Normalize dict keys to match TeamRanking schema
    rankings = [
        TeamRanking(
            team_id=r.get('team_id', 0),
            team_name=r.get('team_name', ''),
            total_score=r.get('score', r.get('total_score', 0.0)),
            activities_completed=r.get('activities_completed', 0),
            rank=r.get('rank', 0)
        )
        for r in rankings_dict
    ]
    
    return ActivityRanking(
        activity_id=activity_id,
        activity_name=db_activity.name,
        rankings=rankings
    )


@router.get("/ranking/global", response_model=GlobalRanking)
def get_global_ranking(
    *,
    db: Session = Depends(get_db),
    _: None = Depends(require(Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)),
) -> GlobalRanking:
    """Get global team ranking"""
    scoring_service = ScoringService(db)
    rankings_dict = scoring_service.get_team_ranking()
    
    from app.schemas.activity import TeamRanking
    rankings = [TeamRanking(**r) for r in rankings_dict]
    
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
    _: None = Depends(require(Action.CREATE_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)),
) -> Dict[str, str]:
    """Create team vs team activity results"""
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
    _: None = Depends(require(Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT)),
) -> Dict[str, Any]:
    """Get statistics for a specific activity"""
    db_activity = activity.get(db, id=activity_id)
    if not db_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVITY_NOT_FOUND
        )
    
    scoring_service = ScoringService(db)
    statistics = scoring_service.get_activity_statistics(activity_id)
    
    return statistics

