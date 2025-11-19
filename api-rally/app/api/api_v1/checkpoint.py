from typing import Annotated, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Security
from pydantic import TypeAdapter
from sqlalchemy.orm import Session

from app import crud
from app.api import deps
from app.api.auth import AuthData, api_nei_auth
from app.api.abac_deps import (
    require_checkpoint_view_permission,
    require_checkpoint_management_permission,
    validate_checkpoint_access
)
from app.exception import NotFoundException
from app.schemas.user import DetailedUser
from app.schemas.team import AdminCheckPointSelect, ListingTeam
from app.schemas.checkpoint import DetailedCheckPoint, CheckPointCreate, CheckPointUpdate
from app.models.team import Team


router = APIRouter()


@router.get("/", status_code=200)
def get_checkpoints(*, db: Session = Depends(deps.get_db)) -> List[DetailedCheckPoint]:
    detailed_checkpoint_list_adapter = TypeAdapter(List[DetailedCheckPoint])
    return detailed_checkpoint_list_adapter.validate_python(
        crud.checkpoint.get_all_ordered(db=db)
    )


@router.get("/me", status_code=200)
def get_next_checkpoint(
    *,
    db: Session = Depends(deps.get_db),
    curr_user: DetailedUser = Depends(deps.get_participant)
) -> DetailedCheckPoint:
    """Return the next checkpoint a team must head to."""
    if curr_user.team_id is None:
        raise HTTPException(status_code=409, detail="User doesn't belong to a team")

    checkpoint = crud.checkpoint.get_next(db=db, team_id=curr_user.team_id)

    if checkpoint is None:
        raise NotFoundException(detail="Checkpoint Not Found")

    return DetailedCheckPoint.model_validate(checkpoint)


@router.get("/teams", status_code=200)
def get_checkpoint_teams(
    *,
    db: Session = Depends(deps.get_db),
    select: Annotated[AdminCheckPointSelect, Depends()],
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    admin_or_staff_user: DetailedUser = Depends(deps.get_admin_or_staff)
) -> List[ListingTeam]:
    """
    If a staff is authenticated, returned all teams that just passed
    through a staff's checkpoint.
    If an admin is authenticated, returned all teams.
    """
    # Use ABAC to validate checkpoint access
    checkpoint_id = validate_checkpoint_access(
        user=admin_or_staff_user,
        auth=auth,
        requested_checkpoint_id=select.checkpoint_id
    )
    
    # Enforce ABAC permission for viewing checkpoint teams
    require_checkpoint_view_permission(
        checkpoint_id=checkpoint_id,
        auth=auth,
        curr_user=admin_or_staff_user
    )
    
    if deps.is_admin(auth.scopes) and select.checkpoint_id is None:
        teams = crud.team.get_multi(db)
    else:
        teams = crud.team.get_by_checkpoint(db=db, checkpoint_id=checkpoint_id)
    
    def build_team(team: Team) -> ListingTeam:
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
            num_members=len(team.members),
        )
    
    return list(map(build_team, teams))


@router.post("/", status_code=201)
def create_checkpoint(
    *,
    db: Session = Depends(deps.get_db),
    cp_in: CheckPointCreate,
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> DetailedCheckPoint:
    # Enforce ABAC permission for checkpoint creation
    require_checkpoint_management_permission(auth=auth, curr_user=curr_user)
    
    # Validate order uniqueness
    existing_checkpoint = crud.checkpoint.get_by_order(db=db, order=cp_in.order)
    if existing_checkpoint:
        raise HTTPException(
            status_code=400, 
            detail=f"Checkpoint with order {cp_in.order} already exists"
        )
    
    cp = crud.checkpoint.create(db=db, obj_in=cp_in)
    return DetailedCheckPoint.model_validate(cp)


@router.put("/reorder", status_code=200)
def reorder_checkpoints(
    *,
    db: Session = Depends(deps.get_db),
    checkpoint_orders: Dict[int, int],
    _: DetailedUser = Depends(deps.get_admin),
) -> Dict[str, str]:
    """Reorder checkpoints by updating their order values."""
    try:
        crud.checkpoint.reorder_checkpoints(db=db, checkpoint_orders=checkpoint_orders)
        return {"message": "Checkpoints reordered successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot reorder checkpoints: {str(e)}"
        )


@router.put("/{id}", status_code=200)
def update_checkpoint(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    cp_in: CheckPointUpdate,
    _: DetailedUser = Depends(deps.get_admin),
) -> DetailedCheckPoint:
    crud.checkpoint.get(db=db, id=id, for_update=True)
    updated = crud.checkpoint.update(db=db, id=id, obj_in=cp_in)
    return DetailedCheckPoint.model_validate(updated)


@router.delete("/{id}", status_code=200)
def delete_checkpoint(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    _: DetailedUser = Depends(deps.get_admin),
) -> Dict[str, str]:
    """Delete a checkpoint. Only admins can delete checkpoints."""
    try:
        # First, remove any staff assignments to this checkpoint
        from app.models.rally_staff_assignment import RallyStaffAssignment
        from app.models.user import User
        from sqlalchemy import delete, update
        
        # Delete staff assignments referencing this checkpoint
        delete_stmt = delete(RallyStaffAssignment).where(RallyStaffAssignment.checkpoint_id == id)
        db.execute(delete_stmt)
        
        # Clear staff_checkpoint_id from Rally users
        update_stmt = update(User).where(User.staff_checkpoint_id == id).values(staff_checkpoint_id=None)
        db.execute(update_stmt)
        
        # Now delete the checkpoint
        crud.checkpoint.remove(db=db, id=id)
        db.commit()
        
        return {"message": "Checkpoint deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete checkpoint: {str(e)}"
        )
