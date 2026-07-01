"""
ABAC-enhanced dependencies for Rally API

This module provides FastAPI dependencies that enforce ABAC policies
for Rally checkpoint and team management.
"""

from typing import Callable, Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.api import deps
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_current_user
from app.schemas.user import DetailedUser
from app.core.abac import (
    Action, Resource, require_permission,
    get_accessible_checkpoints, check_permission
)
from app.api.deps import is_admin

# Explicit exports for mypy
__all__ = [
    "require",
    "get_staff_with_checkpoint_access",
    "require_checkpoint_score_permission",
    "require_checkpoint_view_permission",
    "require_checkpoint_management_permission",
    "require_team_management_permission",
    "require_view_team_members_permission",
    "validate_checkpoint_access",
    "validate_settings_update_access",
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
        current_user: DetailedUser = Depends(get_current_user),
        auth: AuthData = Depends(api_nei_auth),
    ) -> None:
        require_permission(current_user, auth, action, resource)

    return dependency


def get_staff_with_checkpoint_access(
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = Depends(get_current_user),
    db: AsyncSession = Depends(deps.get_db)
) -> DetailedUser:
    """
    Get staff user with ABAC checkpoint access validation.

    ``get_current_user`` already mirrors the authentik identity into a local
    user row and loads ``staff_checkpoint_id`` for rally-staff. Here we only
    enforce that the user holds a rally scope and, for staff, has an assigned
    checkpoint.

    Ensures the user is either:
    - Admin (full access)
    - Rally manager (full access)
    - Rally staff with assigned checkpoint
    """

    logger.info(f"get_staff_with_checkpoint_access: user_id={curr_user.id}, scopes={auth.scopes}")

    if not deps.is_admin_or_staff(auth.scopes):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have Rally permissions"
        )

    # For staff users, ensure they have a checkpoint assignment.
    if deps.is_staff(auth.scopes) and not deps.is_admin(auth.scopes):
        if curr_user.staff_checkpoint_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff user must be assigned to a checkpoint"
            )
        logger.info(f"Staff user {curr_user.id} assigned to checkpoint {curr_user.staff_checkpoint_id}")

    return curr_user


async def require_checkpoint_score_permission(
    checkpoint_id: int,
    team_id: int,
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = Depends(get_staff_with_checkpoint_access),
    db: AsyncSession = Depends(get_db)
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
    if deps.is_staff(auth.scopes) and not deps.is_admin(auth.scopes):
        from app import crud
        
        # Get team to check their progress
        team = await crud.team.get(db=db, id=team_id)
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )

        # Get checkpoint to check its order
        checkpoint = await crud.checkpoint.get(db=db, id=checkpoint_id)
        if not checkpoint:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Checkpoint not found"
            )
        
        # Check if team is at the correct checkpoint order
        expected_order = len(team.times) + 1
        if checkpoint.order != expected_order:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Team must complete checkpoint order {expected_order} before checkpoint order {checkpoint.order}"
            )
    
    require_permission(
        user=curr_user,
        auth=auth,
        action=Action.ADD_CHECKPOINT_SCORE,
        resource=Resource.SCORE,
        checkpoint_id=checkpoint_id,
        team_id=team_id
    )


def require_checkpoint_view_permission(
    checkpoint_id: Optional[int],
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = Depends(get_staff_with_checkpoint_access)
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
        checkpoint_id=checkpoint_id
    )


def require_checkpoint_management_permission(
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = Depends(deps.get_participant)
) -> None:
    """
    Require permission to create/update checkpoints
    """
    require_permission(
        user=curr_user,
        auth=auth,
        action=Action.CREATE_CHECKPOINT,
        resource=Resource.CHECKPOINT
    )


def require_team_management_permission(
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = Depends(deps.get_participant)
) -> None:
    """
    Require permission to create/update teams
    """
    require_permission(
        user=curr_user,
        auth=auth,
        action=Action.CREATE_TEAM,
        resource=Resource.TEAM
    )


def require_view_team_members_permission(
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = Depends(deps.get_participant),
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
        checkpoint_id=curr_user.staff_checkpoint_id
    )


def validate_checkpoint_access(
    user: DetailedUser,
    auth: AuthData,
    requested_checkpoint_id: Optional[int] = None
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
    if not accessible_checkpoints:  # Empty list means all checkpoints
        if requested_checkpoint_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Checkpoint ID must be specified"
            )
        return requested_checkpoint_id
    
    # Staff users can only access their assigned checkpoint
    if requested_checkpoint_id is None:
        if user.staff_checkpoint_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Staff user must specify checkpoint ID or have assigned checkpoint"
            )
        return user.staff_checkpoint_id
    
    # Validate requested checkpoint is accessible
    if requested_checkpoint_id not in accessible_checkpoints:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied to checkpoint {requested_checkpoint_id}"
        )
    
    return requested_checkpoint_id

def validate_settings_update_access(
    user: DetailedUser,
    auth: AuthData
) -> bool:
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
        user=user,
        auth=auth,
        action=Action.UPDATE_RALLY_SETTINGS,
        resource=Resource.RALLY_SETTINGS
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to rally settings"
        )
    
    return True

def validate_settings_view_access(
    user: DetailedUser,
    auth: AuthData
) -> bool:
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
        user=user,
        auth=auth,
        action=Action.VIEW_RALLY_SETTINGS,
        resource=Resource.RALLY_SETTINGS
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to rally settings"
        )
    
    return True