from typing import List
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Security

from app import crud
from app.api import deps
from app.api.auth import AuthData, api_nei_auth
from app.api.abac_deps import (
    require_checkpoint_score_permission,
    require_team_management_permission,
    validate_checkpoint_access
)
from app.models.team import Team
from app.schemas.user import DetailedUser
from app.schemas.team import (
    TeamCreate,
    ListingTeam,
    TeamUpdate,
    DetailedTeam,
    TeamScoresUpdate,
)


router = APIRouter()


def _get_last_checkpoint_info(db: Session, team_id: int):
    """Get last checkpoint number and name from last activity result"""
    from app.models.activity import ActivityResult, Activity
    
    last_result = db.query(ActivityResult).filter(
        ActivityResult.team_id == team_id,
        ActivityResult.is_completed == True
    ).order_by(ActivityResult.completed_at.desc()).first()
    
    if last_result:
        activity = db.query(Activity).filter(Activity.id == last_result.activity_id).first()
        if activity:
            return activity.checkpoint.order, activity.checkpoint.name
    return None, None


def _calculate_current_checkpoint_number(db: Session, team: Team) -> int:
    """Calculate where team should be evaluated next"""
    last_visited_checkpoint_order = len(team.times) if team.times else 0
    
    if last_visited_checkpoint_order == 0:
        return 1
    
    # Check if all activities at last checkpoint are completed
    from app.crud.crud_activity import activity, activity_result
    from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
    
    checkpoint_obj = checkpoint_crud.get_by_order(db, last_visited_checkpoint_order)
    if not checkpoint_obj:
        return last_visited_checkpoint_order
    
    # Use actual checkpoint ID
    checkpoint_activities = activity.get_by_checkpoint(db, checkpoint_id=checkpoint_obj.id)
    team_results = activity_result.get_by_team(db, team_id=team.id)
    completed_at_checkpoint = [
        r for r in team_results 
        if r.activity_id in [a.id for a in checkpoint_activities]
    ]
    
    # If all activities completed, next checkpoint
    if len(completed_at_checkpoint) == len(checkpoint_activities) and checkpoint_activities:
        return last_visited_checkpoint_order + 1
    return last_visited_checkpoint_order


def _build_team_data(db: Session, team: Team) -> ListingTeam:
    """Build team data for listing"""
    last_checkpoint_number, last_checkpoint_name = _get_last_checkpoint_info(db, team.id)
    current_checkpoint_number = _calculate_current_checkpoint_number(db, team)
    
    return ListingTeam(
        id=team.id,
        name=team.name,
        total=team.total,
        classification=team.classification,
        times=team.times,
        last_checkpoint_time=team.times[-1] if len(team.times) > 0 else None,
        last_checkpoint_score=(
            team.score_per_checkpoint[-1]
            if len(team.score_per_checkpoint) > 0
            else None
        ),
        last_checkpoint_number=last_checkpoint_number,
        last_checkpoint_name=last_checkpoint_name,
        current_checkpoint_number=current_checkpoint_number,
        num_members=len(team.members),
    )


@router.get("/", status_code=200)
def get_teams(*, db: Session = Depends(deps.get_db)) -> List[ListingTeam]:
    teams = crud.team.get_multi(db)
    return [_build_team_data(db, team) for team in teams]


@router.get("/me", status_code=200)
def get_own_team(
    db: Session = Depends(deps.get_db),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> DetailedTeam:
    return DetailedTeam.model_validate(crud.team.get(db=db, id=curr_user.team_id))


@router.get("/{id}", status_code=200)
def get_team_by_id(
    *,
    id: int,
    db: Session = Depends(deps.get_db),
) -> DetailedTeam:
    return DetailedTeam.model_validate(crud.team.get(db=db, id=id))


@router.put("/{id}/checkpoint", status_code=201)
def add_checkpoint(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    obj_in: TeamScoresUpdate,
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    staff_user: DetailedUser = Depends(deps.get_admin_or_staff),
) -> DetailedTeam:
    # Use ABAC to validate checkpoint access
    checkpoint_id = validate_checkpoint_access(
        user=staff_user,
        auth=auth,
        requested_checkpoint_id=obj_in.checkpoint_id
    )
    
    # Enforce ABAC permission for adding scores
    require_checkpoint_score_permission(
        checkpoint_id=checkpoint_id,
        team_id=id,
        auth=auth,
        curr_user=staff_user
    )
    
    team_db = crud.team.add_checkpoint(
        db=db,
        id=id,
        checkpoint_id=checkpoint_id,
        obj_in=obj_in,
    )
    return DetailedTeam.model_validate(team_db)




@router.post("/", status_code=201)
def create_team(
    *,
    db: Session = Depends(deps.get_db),
    team_in: TeamCreate,
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> DetailedTeam:
    # Enforce ABAC permission for team creation
    require_team_management_permission(auth=auth, curr_user=curr_user)
    
    return DetailedTeam.model_validate(crud.team.create(db=db, obj_in=team_in))


@router.put("/{id}", status_code=200, response_model=DetailedTeam)
def update_team(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    team_in: TeamUpdate,
    _: DetailedUser = Depends(deps.get_admin),
) -> DetailedTeam:
    return DetailedTeam.model_validate(crud.team.update(db=db, id=id, obj_in=team_in))


@router.delete("/{id}", status_code=200)
def delete_team(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    _: DetailedUser = Depends(deps.get_admin),
) -> dict:
    """Delete a team. Only admins can delete teams."""
    try:
        # Check if team has members before deleting
        team = crud.team.get(db=db, id=id)
        if team and len(team.members) > 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete team with members. Remove all members first."
            )
        
        crud.team.remove(db=db, id=id)
        return {"message": "Team deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete team: {str(e)}"
        )
