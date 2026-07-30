"""
ABAC-enhanced dependencies for Rally API

This module provides FastAPI dependencies that enforce ABAC policies
for Rally checkpoint and team management.
"""

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, is_admin
from app.core.abac import (
    Action,
    AllCheckpoints,
    Resource,
    check_permission,
    get_accessible_checkpoints,
    require_permission,
)
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_rally_staff_assignment import rally_staff_assignment
from app.crud.crud_team import CRUDTeam
from app.crud.deps import get_checkpoint_crud, get_team_crud
from app.schemas.user import DetailedUser

# Explicit exports for mypy
__all__ = [
    "get_staff_with_checkpoint_access",
    "require_checkpoint_score_permission",
    "require_checkpoint_view_permission",
    "require_checkpoint_management_permission",
    "require_team_management_permission",
    "require_add_team_member_permission",
    "require_view_team_members_permission",
    "require",
    "validate_checkpoint_access",
    "validate_settings_update_access",
    "validate_settings_view_access",
    "require_permission",
    "Action",
    "Resource",
]


def require(action: Action, resource: Resource) -> Callable[..., None]:
    """FastAPI dependency factory enforcing an ABAC permission before the route body runs.

    Use for endpoints whose permission needs no per-request context kwargs
    (e.g. checkpoint_id/team_id). Endpoints that need such context keep calling
    require_permission(...) explicitly inside the body.

    Usage:
        @router.get(...)
        def handler(_: None = Depends(require(Action.VIEW_ACTIVITY, Resource.ACTIVITY))):
            ...
    """

    def dependency(
        current_user: DetailedUser = Depends(deps.get_current_user),
        auth: AuthData = Depends(api_nei_auth),
    ) -> None:
        require_permission(current_user, auth, action, resource)

    return dependency


async def get_staff_with_checkpoint_access(
    auth: AuthData = Depends(api_nei_auth),
    db: AsyncSession = Depends(deps.get_db),
    curr_user: DetailedUser = Depends(deps.get_current_user),
) -> DetailedUser:
    """
    Get staff user with ABAC checkpoint access validation

    Ensures the user is either:
    - Admin (full access)
    - Rally manager (full access)
    - Rally staff with assigned checkpoint
    """
    # DEBUG only, and never the oidc_sub — this dependency runs on every
    # staff request and oidc_sub is PII, not an operational signal.
    logger.debug(f"get_staff_with_checkpoint_access: user_id={curr_user.id}, scopes={auth.scopes}")

    # Check if user has any Rally permissions
    has_rally_access = any(
        scope in ["admin", "manager-rally", "rally-staff"] for scope in auth.scopes
    )

    if not has_rally_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User does not have Rally permissions"
        )

    # For staff users, ensure they have a checkpoint assignment
    if (
        "rally-staff" in auth.scopes
        and not is_admin(auth.scopes)
        and not curr_user.staff_checkpoint_id
    ):
        logger.debug(f"Checking staff assignment for user_id={curr_user.id}")
        staff_assignment = await rally_staff_assignment.get_by_user_id(db, curr_user.id)
        if not staff_assignment or not staff_assignment.checkpoint_id:
            logger.warning(f"No staff assignment found for user_id={curr_user.id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff user must be assigned to a checkpoint",
            )
        # Add checkpoint_id to user for easy access
        curr_user.staff_checkpoint_id = staff_assignment.checkpoint_id
        logger.debug(
            f"Staff user {curr_user.id} assigned to checkpoint {staff_assignment.checkpoint_id}"
        )

    return curr_user


async def require_checkpoint_score_permission(
    checkpoint_id: int,
    team_id: int,
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = Depends(get_staff_with_checkpoint_access),
    db: AsyncSession = Depends(get_db),
    team_crud: CRUDTeam = Depends(get_team_crud),
    checkpoint_crud: CRUDCheckPoint = Depends(get_checkpoint_crud),
) -> None:
    """
    Require permission to add checkpoint scores

    Args:
        checkpoint_id: The checkpoint ID to add scores for
        team_id: The team ID to add scores to
        auth: Authentication data
        curr_user: Current user with staff access
    """
    # For staff users, validate checkpoint order
    if "rally-staff" in auth.scopes and not is_admin(auth.scopes):
        # Get team to check their progress
        team = await team_crud.get(db=db, id=team_id)
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

        # Get checkpoint to check its order
        checkpoint = await checkpoint_crud.get(db=db, id=checkpoint_id)
        if not checkpoint:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Checkpoint not found"
            )

        # Check if team is at the correct checkpoint order
        expected_order = len(team.times) + 1
        if checkpoint.order != expected_order:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Team must complete checkpoint order {expected_order} before checkpoint "
                    f"order {checkpoint.order}"
                ),
            )

    require_permission(
        user=curr_user,
        auth=auth,
        action=Action.ADD_CHECKPOINT_SCORE,
        resource=Resource.SCORE,
        checkpoint_id=checkpoint_id,
        team_id=team_id,
    )


def require_checkpoint_view_permission(
    checkpoint_id: int | None = None,
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = Depends(get_staff_with_checkpoint_access),
) -> None:
    """
    Require permission to view checkpoint teams

    Args:
        checkpoint_id: The checkpoint ID to view teams for
        auth: Authentication data
        curr_user: Current user with staff access
    """
    # If no checkpoint_id specified, use user's assigned checkpoint
    if checkpoint_id is None and curr_user.staff_checkpoint_id:
        checkpoint_id = curr_user.staff_checkpoint_id

    require_permission(
        user=curr_user,
        auth=auth,
        action=Action.VIEW_CHECKPOINT_TEAMS,
        resource=Resource.CHECKPOINT,
        checkpoint_id=checkpoint_id,
    )


def require_checkpoint_management_permission(
    auth: AuthData = Depends(api_nei_auth), curr_user: DetailedUser = Depends(deps.get_participant)
) -> None:
    """
    Require permission to create/update checkpoints
    """
    require_permission(
        user=curr_user, auth=auth, action=Action.CREATE_CHECKPOINT, resource=Resource.CHECKPOINT
    )


def require_team_management_permission(
    auth: AuthData = Depends(api_nei_auth), curr_user: DetailedUser = Depends(deps.get_participant)
) -> None:
    """
    Require permission to create/update teams
    """
    require_permission(user=curr_user, auth=auth, action=Action.CREATE_TEAM, resource=Resource.TEAM)


def require_add_team_member_permission(
    auth: AuthData = Depends(api_nei_auth), curr_user: DetailedUser = Depends(deps.get_participant)
) -> None:
    """Require permission to add a member to a team.

    Separate from require_team_management_permission because rally staff are
    granted this one action (walk-up registration) but must not be able to
    create teams, mutate/remove members, or search the account directory.
    """
    require_permission(
        user=curr_user, auth=auth, action=Action.ADD_TEAM_MEMBER, resource=Resource.TEAM
    )


def require_view_team_members_permission(
    auth: AuthData = Depends(api_nei_auth), curr_user: DetailedUser = Depends(deps.get_participant)
) -> None:
    """
    Require permission to view team members
    """
    # If using API key/admin access, bypass further checks
    if is_admin(auth.scopes):
        return

    # Staff can view team members if they have a checkpoint assignment
    # Pass staff's checkpoint_id as context for ABAC evaluation
    require_permission(
        user=curr_user,
        auth=auth,
        action=Action.VIEW_TEAM_MEMBERS,
        resource=Resource.TEAM,
        checkpoint_id=curr_user.staff_checkpoint_id,
    )


def validate_checkpoint_access(
    user: DetailedUser, auth: AuthData, requested_checkpoint_id: int | None = None
) -> int:
    """
    Validate and return the checkpoint ID the user can access

    Args:
        user: The authenticated user
        auth: Authentication data
        requested_checkpoint_id: Checkpoint ID requested by user

    Returns:
        The checkpoint ID the user can access

    Raises:
        HTTPException: If access is denied
    """
    accessible_checkpoints = get_accessible_checkpoints(user, auth)

    # Admins and managers can access any checkpoint
    if isinstance(accessible_checkpoints, AllCheckpoints):
        if requested_checkpoint_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Checkpoint ID must be specified"
            )
        return requested_checkpoint_id

    # Staff users can only access their assigned checkpoint
    if requested_checkpoint_id is None:
        if user.staff_checkpoint_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Staff user must specify checkpoint ID or have assigned checkpoint",
            )
        return user.staff_checkpoint_id

    # Validate requested checkpoint is accessible
    if requested_checkpoint_id not in accessible_checkpoints:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied to checkpoint {requested_checkpoint_id}",
        )

    return requested_checkpoint_id


def validate_settings_update_access(user: DetailedUser, auth: AuthData) -> bool:
    """
    Validate that the user has access to update the rally settings.

    Args:
        user: The authenticated user
        auth: Authentication data with scopes

    Returns:
        True if access is granted

    Raises:
        HTTPException: If access is denied
    """

    if not check_permission(
        user=user, auth=auth, action=Action.UPDATE_RALLY_SETTINGS, resource=Resource.RALLY_SETTINGS
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to rally settings"
        )

    return True


def validate_settings_view_access(user: DetailedUser, auth: AuthData) -> bool:
    """
    Validate that the user has access to view the rally settings.

    Args:
        user: The authenticated user
        auth: Authentication data with scopes

    Returns:
        True if access is granted

    Raises:
        HTTPException: If access is denied
    """

    if not check_permission(
        user=user, auth=auth, action=Action.VIEW_RALLY_SETTINGS, resource=Resource.RALLY_SETTINGS
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to rally settings"
        )

    return True
