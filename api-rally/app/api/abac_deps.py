"""
ABAC-enhanced dependencies for Rally API

This module provides FastAPI dependencies that enforce ABAC policies
for Rally checkpoint and team management.
"""

from typing import Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from loguru import logger

from app.api import deps
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db
from app.models.user import User
from app.schemas.user import DetailedUser
from app.core.abac import (
    Action, Resource, require_permission, 
    get_accessible_checkpoints, check_permission
)
from app.api.deps import is_admin

# Explicit exports for mypy
__all__ = [
    "get_staff_with_checkpoint_access",
    "require_checkpoint_score_permission",
    "require_checkpoint_view_permission",
    "require_checkpoint_management_permission",
    "require_team_management_permission",
    "validate_checkpoint_access",
    "validate_settings_update_access",
    "require_permission",
    "Action",
    "Resource",
]


def _initialize_user_from_auth(auth: AuthData, db: Session) -> DetailedUser:
    """Initialize DetailedUser from auth data with fallback to database"""
    try:
        return DetailedUser(
            id=auth.sub,
            name=f"{auth.name} {auth.surname}".strip() or auth.email,
            disabled=False,
            staff_checkpoint_id=None,
            team_id=None,
            is_captain=False,
        )
    except (ValueError, TypeError, AttributeError):
        # Fallback: attempt to load from local User if schema changes or validation fails
        user = db.get(User, auth.sub)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        try:
            return DetailedUser.model_validate(user)
        except Exception as validation_error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to validate user data: {str(validation_error)}"
            )


def _validate_staff_checkpoint_assignment(
    curr_user: DetailedUser, auth: AuthData, db: Session
) -> None:
    """Validate and set staff checkpoint assignment"""
    from app.crud.crud_rally_staff_assignment import rally_staff_assignment
    
    staff_assignment = rally_staff_assignment.get_by_user_id(db, auth.sub)
    if not staff_assignment or not staff_assignment.checkpoint_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff user must be assigned to a checkpoint"
        )
    curr_user.staff_checkpoint_id = staff_assignment.checkpoint_id


def get_staff_with_checkpoint_access(
    auth: AuthData = Depends(api_nei_auth),
    curr_user: Optional[DetailedUser] = None,
    db: Session = Depends(deps.get_db)
) -> DetailedUser:
    """
    Get staff user with ABAC checkpoint access validation
    
    Ensures the user is either:
    - Admin (full access)
    - Rally manager (full access) 
    - Rally staff with assigned checkpoint
    """
    
    # Log authentication data for debugging
    logger.info(f"get_staff_with_checkpoint_access: auth.sub={auth.sub}, scopes={auth.scopes}")
    
    if curr_user is None:
        # Build user from auth claims to avoid hard dependency on local User row
        # Local User may not exist for staff-only access; we still want staff to work.
        try:
            curr_user = _initialize_user_from_auth(auth, db)
            logger.info(f"Created DetailedUser from auth: id={curr_user.id}, name={curr_user.name}")
        except HTTPException:
            # Re-raise HTTP exceptions from helper
            raise
        except Exception as e:
            logger.error(f"Unexpected error initializing user: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to initialize user: {str(e)}"
            )
    
    # Check if user has any Rally permissions
    has_rally_access = any(scope in ["admin", "manager-rally", "rally-staff"] 
                          for scope in auth.scopes)
    
    if not has_rally_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have Rally permissions"
        )
    
    # For staff users, ensure they have a checkpoint assignment
    if "rally-staff" in auth.scopes and not is_admin(auth.scopes):
        logger.info(f"Checking staff assignment for user_id={auth.sub}")
        _validate_staff_checkpoint_assignment(curr_user, auth, db)
        logger.info(f"Staff user {auth.sub} assigned to checkpoint {curr_user.staff_checkpoint_id}")
    
    logger.info(f"Returning DetailedUser: id={curr_user.id}, staff_checkpoint_id={curr_user.staff_checkpoint_id}")
    return curr_user


def require_checkpoint_score_permission(
    checkpoint_id: int,
    team_id: int,
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = Depends(get_staff_with_checkpoint_access),
    db: Session = Depends(get_db)
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
        from app import crud
        
        # Get team to check their progress
        team = crud.team.get(db=db, id=team_id)
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )
        
        # Get checkpoint to check its order
        checkpoint = crud.checkpoint.get(db=db, id=checkpoint_id)
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