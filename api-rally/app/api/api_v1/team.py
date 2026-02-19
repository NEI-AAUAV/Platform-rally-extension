from typing import List, Tuple, Optional, Dict, Any
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


def _compute_checkpoint_progress(db: Session, team_obj: Team) -> Tuple[int, int, Optional[str]]:
    """Compute last fully completed checkpoint and current checkpoint.
    A checkpoint is considered completed only when all its activities have a
    completed result for this team.
    Returns: (last_completed_order, current_order, last_checkpoint_name)
    """
    from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
    from app.crud.crud_activity import activity
    from app.crud.crud_activity import activity_result as activity_result_crud

    checkpoints = checkpoint_crud.get_all_ordered(db)
    team_results = activity_result_crud.get_by_team(db, team_id=team_obj.id)
    completed_activity_ids = {r.activity_id for r in team_results if getattr(r, "is_completed", False)}

    last_completed_order = 0
    last_completed_name: str | None = None
    for cp in checkpoints:
        cp_activities = activity.get_by_checkpoint(db, checkpoint_id=cp.id)
        ids = [a.id for a in cp_activities]
        if not ids:
            break
        if all(aid in completed_activity_ids for aid in ids):
            last_completed_order = cp.order
            last_completed_name = cp.name
        else:
            break

    max_order = checkpoints[-1].order if checkpoints else 0
    current_order = last_completed_order + 1 if last_completed_order < max_order else last_completed_order
    return last_completed_order, current_order, last_completed_name


def _calculate_current_checkpoint_number(db: Session, team: Team) -> int:
    last_completed_order, current_order, _ = _compute_checkpoint_progress(db, team)
    return current_order or 1


def _build_team_data(db: Session, team: Team) -> ListingTeam:
    """Build team data for listing using strict completion rules."""
    last_checkpoint_number, current_checkpoint_number, last_checkpoint_name = _compute_checkpoint_progress(db, team)
    
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
    from app.crud.crud_checkpoint import checkpoint as checkpoint_crud  # noqa: PLC0415
    team_obj = crud.team.get(db=db, id=curr_user.team_id)
    last_cp, current_cp, _ = _compute_checkpoint_progress(db, team_obj)
    result = DetailedTeam.model_validate(team_obj)
    result.last_checkpoint_number = last_cp
    result.current_checkpoint_number = current_cp
    result.total_checkpoints = len(checkpoint_crud.get_all_ordered(db))
    return result


@router.get("/{id}", status_code=200)
def get_team_by_id(
    *,
    id: int,
    db: Session = Depends(deps.get_db),
) -> DetailedTeam:
    from app.crud.crud_checkpoint import checkpoint as checkpoint_crud  # noqa: PLC0415
    team_obj = crud.team.get(db=db, id=id)
    last_cp, current_cp, _ = _compute_checkpoint_progress(db, team_obj)
    result = DetailedTeam.model_validate(team_obj)
    result.last_checkpoint_number = last_cp
    result.current_checkpoint_number = current_cp
    result.total_checkpoints = len(checkpoint_crud.get_all_ordered(db))
    return result


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
) -> Dict[str, str]:
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


@router.get("/{id}/evaluations", status_code=200)
def get_team_evaluations(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    # Use optional auth to allow either NEI user or Team token
    current_user: Optional[DetailedUser] = Depends(deps.get_current_user_optional),
    auth: Optional[AuthData] = Depends(deps.api_nei_auth_optional),
    current_team: Optional[Team] = Depends(deps.get_current_team_optional),
) -> Dict[str, Any]:
    """
    Get evaluations for a specific team.
    Accessible by:
    - The team members themselves (via Team Token or linked NEI account)
    - Staff/Admins/Managers (via NEI account)
    """
    # 1. Check if authenticated as staff/admin/manager via NEI Auth
    is_admin_or_staff = False
    if auth and auth.scopes:
        is_admin_or_staff = any(scope in auth.scopes for scope in ["admin", "manager-rally", "rally-staff"])

    # 2. Check if authenticated as the specific team
    is_own_team = False
    
    # Case A: NEI User linked to team
    if current_user and current_user.team_id == id:
        is_own_team = True
        
    # Case B: Team Token (Simple Auth)
    if current_team and current_team.team_id == id:
        is_own_team = True

    if not (is_admin_or_staff or is_own_team):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view these evaluations"
        )
    
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    from app.models.activity import ActivityResult
    from app.api.api_v1.staff_evaluation_utils import serialize_activity, serialize_team

    # Fetch results
    stmt = select(ActivityResult).options(
        joinedload(ActivityResult.activity),
        joinedload(ActivityResult.team)
    ).where(
        ActivityResult.team_id == id,
        ActivityResult.is_completed == True
    ).order_by(ActivityResult.completed_at.desc())
    
    results = list(db.scalars(stmt).all())
    
    # Serialize results matches staff_evaluation.py format
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
