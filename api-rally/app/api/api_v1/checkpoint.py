from typing import Annotated

from fastapi import APIRouter, Depends, Security
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api import deps
from app.api.abac_deps import (
    require_checkpoint_management_permission,
    require_checkpoint_view_permission,
    validate_checkpoint_access,
)
from app.api.auth import AuthData, api_nei_auth
from app.core.exceptions import (
    RallyForbiddenError,
    RallyNotFoundError,
    RallyUnauthorizedError,
    RallyValidationError,
)
from app.schemas.checkpoint import CheckPointCreate, CheckPointUpdate, DetailedCheckPoint
from app.schemas.team import AdminCheckPointSelect, ListingTeam
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.checkpoint_service import CheckpointService

_team_bearer = HTTPBearer(auto_error=False)


router = APIRouter()


def _checkpoint_service(db: AsyncSession) -> CheckpointService:
    return CheckpointService(db, crud.checkpoint, crud.team)


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
) -> list[DetailedCheckPoint]:
    """Return visible checkpoints based on settings and the requesting user's role."""
    from app.crud.crud_rally_settings import rally_settings  # noqa: PLC0415

    settings = await rally_settings.get_or_create(db)
    service = _checkpoint_service(db)

    if curr_user:
        scopes = getattr(curr_user, "scopes", [])
        if deps.is_admin_or_staff(scopes):
            return await service.all_checkpoints()
        if curr_user.team_id:
            return await service.visible_checkpoints_for_team(curr_user.team_id, settings)

    if curr_team:
        return await service.visible_checkpoints_for_team(curr_team.team_id, settings)

    result = await service.visible_checkpoints_for_public(settings)
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
            raise RallyUnauthorizedError("Authentication required")

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
        raise RallyUnauthorizedError("Authentication required (User with Team or Team Token)")

    checkpoint = await crud.checkpoint.get_next(db=db, team_id=team_id)

    if checkpoint is None:
        raise RallyNotFoundError("Checkpoint Not Found")

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
) -> list[ListingTeam]:
    """
    If a staff is authenticated, returned all teams that just passed
    through a staff's checkpoint.
    If an admin is authenticated, returned all teams.
    """
    # Use ABAC to validate checkpoint access
    checkpoint_id = validate_checkpoint_access(
        user=admin_or_staff_user, auth=auth, requested_checkpoint_id=select_in.checkpoint_id
    )

    # Enforce ABAC permission for viewing checkpoint teams
    require_checkpoint_view_permission(
        checkpoint_id=checkpoint_id, auth=auth, curr_user=admin_or_staff_user
    )

    is_admin_unfiltered = deps.is_admin(auth.scopes) and select_in.checkpoint_id is None
    return await _checkpoint_service(db).list_teams_at_checkpoint(
        checkpoint_id=checkpoint_id, is_admin_unfiltered=is_admin_unfiltered
    )


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
    checkpoint_orders: dict[int, int],
    _: Annotated[DetailedUser, Depends(deps.get_admin)],
) -> dict[str, str]:
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
) -> dict[str, str]:
    """Delete a checkpoint. Only admins can delete checkpoints."""
    try:
        await _checkpoint_service(db).delete_checkpoint(id)
        return {"message": "Checkpoint deleted successfully"}
    except Exception as e:
        await db.rollback()
        raise RallyValidationError(f"Cannot delete checkpoint: {str(e)}")
