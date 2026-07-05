from typing import Annotated, List, Dict, Any, Sequence, Optional

from fastapi import APIRouter, Depends, HTTPException, Security
from app.core.exceptions import RallyForbiddenError, RallyValidationError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.schemas.team_auth import TeamTokenData
from app.schemas.team import AdminCheckPointSelect, ListingTeam
from app.schemas.checkpoint import DetailedCheckPoint, CheckPointCreate, CheckPointUpdate
from app.models.team import Team

_team_bearer = HTTPBearer(auto_error=False)


router = APIRouter()


def _validate_list(items: Sequence[Any]) -> List[DetailedCheckPoint]:
    adapter = TypeAdapter(List[DetailedCheckPoint])
    return adapter.validate_python(items)


async def _get_checkpoints_for_team(
    db: AsyncSession, team_id: int, settings: Any
) -> List[DetailedCheckPoint]:
    """Return visible checkpoints for a team member."""
    if settings.show_route_mode == "complete":
        return _validate_list(await crud.checkpoint.get_all_ordered(db=db))
    all_checkpoints = await crud.checkpoint.get_all_ordered(db=db)
    team = await crud.team.get(db=db, id=team_id)
    if not team:
        return []
    from app.api.api_v1.team import _compute_checkpoint_progress  # noqa: PLC0415

    _, current_order, _ = await _compute_checkpoint_progress(db, team)
    return _validate_list([cp for cp in all_checkpoints if cp.order <= current_order])


async def _get_checkpoints_for_public(
    db: AsyncSession, settings: Any
) -> List[DetailedCheckPoint] | None:
    """Return visible checkpoints for unauthenticated / public access.

    Returns *None* when access should be denied.
    """
    if not (settings.public_access_enabled and settings.show_checkpoint_map):
        if settings.show_checkpoint_map:
            return _validate_list(await crud.checkpoint.get_all_ordered(db=db))
        return None
    if settings.show_route_mode == "focused":
        all_checkpoints = await crud.checkpoint.get_all_ordered(db=db)
        if not all_checkpoints:
            return []
        return _validate_list([all_checkpoints[0]])
    return _validate_list(await crud.checkpoint.get_all_ordered(db=db))


@router.get(
    "/",
    status_code=200,
    responses={403: {"description": "Checkpoint map is hidden"}},
)
async def get_checkpoints(
    *,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    curr_user: Annotated[DetailedUser | None, Depends(deps.get_current_user_optional)],
    curr_team: Annotated[TeamTokenData | None, Depends(deps.get_current_team_optional)],
) -> List[DetailedCheckPoint]:
    """Return visible checkpoints based on settings and the requesting user's role."""
    from app.crud.crud_rally_settings import rally_settings  # noqa: PLC0415
    settings = await rally_settings.get_or_create(db)

    if curr_user:
        scopes = getattr(curr_user, "scopes", [])
        if deps.is_admin_or_staff(scopes):
            return _validate_list(await crud.checkpoint.get_all_ordered(db=db))
        if curr_user.team_id:
            return await _get_checkpoints_for_team(db, curr_user.team_id, settings)

    if curr_team:
        return await _get_checkpoints_for_team(db, curr_team.team_id, settings)

    result = await _get_checkpoints_for_public(db, settings)
    if result is None:
        raise RallyForbiddenError("Checkpoint map is hidden")
    return result


@router.get(
    "/count",
    status_code=200,
    responses={401: {"description": "Authentication required"}},
)
async def get_checkpoints_count(
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    curr_user: Annotated[DetailedUser | None, Depends(deps.get_current_user_optional)] = None,
    curr_team: Annotated[TeamTokenData | None, Depends(deps.get_current_team_optional)] = None,
) -> int:
    """Return the total number of checkpoints."""
    if not curr_user and not curr_team:
        # Optional: Allow public access if settings permit, otherwise 401
        from app.crud.crud_rally_settings import rally_settings
        settings = await rally_settings.get_or_create(db)
        if not settings.public_access_enabled:
            raise HTTPException(status_code=401, detail="Authentication required")

    return await crud.checkpoint.count(db=db)


@router.get(
    "/me",
    status_code=200,
    responses={401: {"description": "Authentication required (User with Team or Team Token)"}},
)
async def get_next_checkpoint(
    *,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    curr_user: Annotated[DetailedUser | None, Depends(deps.get_current_user_optional)],
    curr_team: Annotated[TeamTokenData | None, Depends(deps.get_current_team_optional)],
) -> DetailedCheckPoint:
    """Return the next checkpoint a team must head to."""
    team_id = None
    if curr_user and curr_user.team_id:
        team_id = curr_user.team_id
    elif curr_team:
        team_id = curr_team.team_id

    if not team_id:
        raise HTTPException(status_code=401, detail="Authentication required (User with Team or Team Token)")

    checkpoint = await crud.checkpoint.get_next(db=db, team_id=team_id)

    if checkpoint is None:
        raise NotFoundException(detail="Checkpoint Not Found")

    return DetailedCheckPoint.model_validate(checkpoint)


@router.get(
    "/teams",
    status_code=200,
    responses={401: {"description": "Authentication required"}},
)
async def get_checkpoint_teams(
    *,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    select_in: Annotated[AdminCheckPointSelect, Depends()],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    admin_or_staff_user: Annotated[DetailedUser, Depends(deps.get_admin_or_staff)],
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
        requested_checkpoint_id=select_in.checkpoint_id
    )

    # Enforce ABAC permission for viewing checkpoint teams
    require_checkpoint_view_permission(
        checkpoint_id=checkpoint_id,
        auth=auth,
        curr_user=admin_or_staff_user
    )

    if deps.is_admin(auth.scopes) and select_in.checkpoint_id is None:
        teams = (await db.scalars(select(Team).options(selectinload(Team.members)))).all()
    else:
        teams = await crud.team.get_by_checkpoint(db=db, checkpoint_id=checkpoint_id)

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
async def create_checkpoint(
    *,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    cp_in: CheckPointCreate,
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
) -> DetailedCheckPoint:
    # Enforce ABAC permission for checkpoint creation
    require_checkpoint_management_permission(auth=auth, curr_user=curr_user)

    # Validate order uniqueness
    existing_checkpoint = await crud.checkpoint.get_by_order(db=db, order=cp_in.order)
    if existing_checkpoint:
        raise RallyValidationError(f"Checkpoint with order {cp_in.order} already exists")

    cp = await crud.checkpoint.create(db=db, obj_in=cp_in)
    return DetailedCheckPoint.model_validate(cp)


@router.put("/reorder", status_code=200)
async def reorder_checkpoints(
    *,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    checkpoint_orders: Dict[int, int],
    _: Annotated[DetailedUser, Depends(deps.get_admin)],
) -> Dict[str, str]:
    """Reorder checkpoints by updating their order values."""
    try:
        await crud.checkpoint.reorder_checkpoints(db=db, checkpoint_orders=checkpoint_orders)
        return {"message": "Checkpoints reordered successfully"}
    except Exception as e:
        raise RallyValidationError(f"Cannot reorder checkpoints: {str(e)}")


@router.put("/{id}", status_code=200)
async def update_checkpoint(
    *,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    id: int,
    cp_in: CheckPointUpdate,
    _: Annotated[DetailedUser, Depends(deps.get_admin)],
) -> DetailedCheckPoint:
    await crud.checkpoint.get(db=db, id=id, for_update=True)
    updated = await crud.checkpoint.update(db=db, id=id, obj_in=cp_in)
    return DetailedCheckPoint.model_validate(updated)


@router.delete("/{id}", status_code=200)
async def delete_checkpoint(
    *,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    id: int,
    _: Annotated[DetailedUser, Depends(deps.get_admin)],
) -> Dict[str, str]:
    """Delete a checkpoint. Only admins can delete checkpoints."""
    try:
        # First, remove any staff/guide assignments to this checkpoint
        from app.models.rally_staff_assignment import RallyStaffAssignment
        from app.models.rally_guide_assignment import RallyGuideAssignment
        from app.models.user import User
        from sqlalchemy import delete, update

        # Delete staff and guide assignments referencing this checkpoint
        delete_stmt = delete(RallyStaffAssignment).where(RallyStaffAssignment.checkpoint_id == id)
        await db.execute(delete_stmt)
        delete_guides_stmt = delete(RallyGuideAssignment).where(RallyGuideAssignment.checkpoint_id == id)
        await db.execute(delete_guides_stmt)

        # Clear staff_checkpoint_id from Rally users
        update_stmt = update(User).where(User.staff_checkpoint_id == id).values(staff_checkpoint_id=None)
        await db.execute(update_stmt)

        # Now delete the checkpoint
        await crud.checkpoint.remove(db=db, id=id)
        await db.commit()

        return {"message": "Checkpoint deleted successfully"}
    except Exception as e:
        await db.rollback()
        raise RallyValidationError(f"Cannot delete checkpoint: {str(e)}")
