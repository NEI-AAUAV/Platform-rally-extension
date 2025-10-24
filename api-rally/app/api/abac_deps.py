"""
ABAC-enhanced dependencies for Rally API

This module provides FastAPI dependencies that enforce ABAC policies
for Rally checkpoint and team management.
"""

from typing import Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

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


def get_staff_with_checkpoint_access(
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = None,
    db: Session = Depends(deps.get_db)
) -> DetailedUser:
    """
    Get staff user with ABAC checkpoint access validation
    
    Ensures the user is either:
    - Admin (full access)
    - Rally manager (full access) 
    - Rally staff with assigned checkpoint
    """
    # Initialize curr_user if not provided
    if curr_user is None:
        # Get user directly from database using auth.sub (user ID)
        user = db.get(User, auth.sub)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        curr_user = DetailedUser.model_validate(user)
    
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
        from app.crud.crud_rally_staff_assignment import rally_staff_assignment
        staff_assignment = rally_staff_assignment.get_by_user_id(db, auth.sub)
        if not staff_assignment or not staff_assignment.checkpoint_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff user must be assigned to a checkpoint"
            )
        # Add checkpoint_id to user for easy access
        curr_user.staff_checkpoint_id = staff_assignment.checkpoint_id
    
    return curr_user


def require_checkpoint_score_permission(
    checkpoint_id: int,
    team_id: int,
    auth: AuthData = Depends(api_nei_auth),
    curr_user: DetailedUser = Depends(get_staff_with_checkpoint_access),
    db: Session = Depends(get_db)
):
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
):
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
):
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
):
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