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


@router.get("/", status_code=200)
def get_teams(*, db: Session = Depends(deps.get_db)) -> List[ListingTeam]:
    teams = crud.team.get_multi(db)

    def build_team(team: Team) -> ListingTeam:
        return ListingTeam(
            id=team.id,
            name=team.name,
            total=team.total,
            classification=team.classification,
            last_checkpoint_time=team.times[-1] if len(team.times) > 0 else None,
            last_checkpoint_score=(
                team.score_per_checkpoint[-1]
                if len(team.score_per_checkpoint) > 0
                else None
            ),
            num_members=len(team.members),
        )

    return list(map(build_team, teams))


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
