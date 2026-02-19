from typing import Annotated, List, Dict, Any, Sequence, Optional

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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

_team_bearer = HTTPBearer(auto_error=False)


router = APIRouter()


def _validate_list(items: Sequence[Any], db: Session) -> List[DetailedCheckPoint]:
    adapter = TypeAdapter(List[DetailedCheckPoint])
    return adapter.validate_python(items)


def _get_all_checkpoints(db: Session) -> List[DetailedCheckPoint]:
    from app.crud.crud_rally_settings import rally_settings as _rs  # noqa: PLC0415
    items = crud.checkpoint.get_all_ordered(db=db)
    adapter = TypeAdapter(List[DetailedCheckPoint])
    return adapter.validate_python(items)


def _activity_based_completed_count(db: Session, team_id: int) -> int:
    """Return the number of fully completed checkpoints for a team,
    based on activity results rather than len(team.times)."""
    from app.api.api_v1.team import _compute_checkpoint_progress  # noqa: PLC0415
    team = crud.team.get(db=db, id=team_id)
    if not team:
        return 0
    last_completed, _, _ = _compute_checkpoint_progress(db, team)
    return last_completed


def _get_checkpoints_for_team(
    db: Session, curr_user: DetailedUser, settings: Any
) -> List[DetailedCheckPoint]:
    """Return visible checkpoints for a team member."""
    if settings.show_route_mode == "complete":
        return _validate_list(crud.checkpoint.get_all_ordered(db=db), db)
    all_checkpoints = crud.checkpoint.get_all_ordered(db=db)
    completed_count = _activity_based_completed_count(db, curr_user.team_id)
    return _validate_list(all_checkpoints[: completed_count + 1], db)


def _get_checkpoints_for_team_token(
    db: Session, team_id: int, settings: Any
) -> List[DetailedCheckPoint]:
    """Return visible checkpoints for a team authenticated via team JWT."""
    if settings.show_route_mode == "complete":
        return _validate_list(crud.checkpoint.get_all_ordered(db=db), db)
    all_checkpoints = crud.checkpoint.get_all_ordered(db=db)
    completed_count = _activity_based_completed_count(db, team_id)
    return _validate_list(all_checkpoints[: completed_count + 1], db)


def _get_checkpoints_for_public(
    db: Session, settings: Any
) -> List[DetailedCheckPoint] | None:
    """Return visible checkpoints for unauthenticated / public access.

    Returns *None* when access should be denied.
    """
    if not (settings.public_access_enabled and settings.show_checkpoint_map):
        if settings.show_checkpoint_map:
            return _validate_list(crud.checkpoint.get_all_ordered(db=db), db)
        return None
    if settings.show_route_mode == "focused":
        all_checkpoints = crud.checkpoint.get_all_ordered(db=db)
        if not all_checkpoints:
            return []
        return _validate_list([all_checkpoints[0]], db)
    return _validate_list(crud.checkpoint.get_all_ordered(db=db), db)


@router.get(
    "/",
    status_code=200,
    responses={403: {"description": "Checkpoint map is hidden"}},
)
def get_checkpoints(
    *,
    db: Annotated[Session, Depends(deps.get_db)],
    curr_user: Annotated[DetailedUser | None, Depends(deps.get_current_user_optional)],
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(_team_bearer)],
) -> List[DetailedCheckPoint]:
    """Return visible checkpoints based on settings and the requesting user's role."""
    from app.crud.crud_rally_settings import rally_settings  # noqa: PLC0415
    settings = rally_settings.get_or_create(db)

    if curr_user:
        scopes = getattr(curr_user, "scopes", [])
        if deps.is_admin_or_staff(scopes):
            return _validate_list(crud.checkpoint.get_all_ordered(db=db), db)
        if curr_user.team_id:
            return _get_checkpoints_for_team(db, curr_user, settings)

    # Fallback: try to authenticate as a team via team JWT
    if credentials:
        from app.api.api_v1.team_auth import verify_team_token  # noqa: PLC0415
        try:
            token_data = verify_team_token(credentials.credentials)
            return _get_checkpoints_for_team_token(db, token_data.team_id, settings)
        except Exception:  # noqa: BLE001
            pass

    result = _get_checkpoints_for_public(db, settings)
    if result is None:
        raise HTTPException(status_code=403, detail="Checkpoint map is hidden")
    return result


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
            versus_group_id=team.versus_group_id,
            times=team.times,
            last_checkpoint_time=team.times[-1] if len(team.times) > 0 else None,
            last_checkpoint_score=(
                team.score_per_checkpoint[-1]
                if len(team.score_per_checkpoint) > 0
                else None
            ),
            num_members=len(team.members),
            last_checkpoint_number=None,
            last_checkpoint_name=None,
            current_checkpoint_number=None,
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
