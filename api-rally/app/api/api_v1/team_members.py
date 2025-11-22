from fastapi import APIRouter, Depends, HTTPException, Security
from sqlalchemy.orm import Session
from typing import List, Dict

from app.api import deps
from app.api.auth import AuthData, api_nei_auth
from app.api.abac_deps import require_team_management_permission
from app.schemas.user import DetailedUser, UserCreate
from app.schemas.team_members import TeamMemberAdd, TeamMemberResponse, TeamMemberUpdate
from app import crud
from app.models.user import User
from app.models.team import Team
from app.crud.crud_rally_settings import rally_settings

router = APIRouter()

# Constants
TEAM_NOT_FOUND_MESSAGE = "Team not found"
USER_NOT_FOUND_MESSAGE = "User not found"


@router.post("/team/{team_id}/members", status_code=201)
def add_team_member(
    team_id: int,
    member_data: TeamMemberAdd,
    db: Session = Depends(deps.get_db),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> TeamMemberResponse:
    """
    Add a member to a team.
    """
    require_team_management_permission(auth=auth, curr_user=curr_user)
    
    # Check if team exists
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail=TEAM_NOT_FOUND_MESSAGE)
    
    # Check member limit
    from sqlalchemy import select, func
    settings = rally_settings.get_or_create(db)
    stmt = select(func.count(User.id)).where(User.team_id == team_id)
    current_member_count = db.scalar(stmt) or 0
    
    if current_member_count >= settings.max_members_per_team:
        raise HTTPException(
            status_code=400, 
            detail=f"Team member limit reached. Maximum {settings.max_members_per_team} members allowed per team."
        )
    
    # If setting as captain, check if team already has a captain
    if member_data.is_captain:
        from sqlalchemy import select
        stmt = select(User).where(
            User.team_id == team_id,
            User.is_captain == True
        )
        existing_captain = db.scalars(stmt).first()
        if existing_captain:
            raise HTTPException(
                status_code=400,
                detail="Team already has a captain. Remove current captain first."
            )
    
    # Create new user with auto-assigned ID
    user_data = UserCreate(
        name=member_data.name,
        email=member_data.email,
        team_id=team_id,
        is_captain=member_data.is_captain
    )
    user = crud.user.create(db, obj_in=user_data)
    
    return TeamMemberResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        is_captain=user.is_captain
    )


@router.delete("/team/{team_id}/members/{user_id}", status_code=200)
def remove_team_member(
    team_id: int,
    user_id: int,
    db: Session = Depends(deps.get_db),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> Dict[str, str]:
    """
    Remove a member from a team.
    """
    require_team_management_permission(auth=auth, curr_user=curr_user)
    
    # Check if team exists
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail=TEAM_NOT_FOUND_MESSAGE)
    
    # Check if user exists and is in this team
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_MESSAGE)
    
    if user.team_id != team_id:
        raise HTTPException(
            status_code=400, 
            detail="User is not a member of this team"
        )
    
    # Remove user from team
    user.team_id = None
    db.commit()
    
    return {"message": "Member removed from team successfully"}


@router.put("/team/{team_id}/members/{user_id}", status_code=200)
def update_team_member(
    team_id: int,
    user_id: int,
    member_data: TeamMemberUpdate,
    db: Session = Depends(deps.get_db),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> TeamMemberResponse:
    """
    Update a team member's information.
    """
    require_team_management_permission(auth=auth, curr_user=curr_user)
    
    # Check if team exists
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail=TEAM_NOT_FOUND_MESSAGE)
    
    # Check if user exists and is in this team
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_MESSAGE)
    
    if user.team_id != team_id:
        raise HTTPException(
            status_code=400, 
            detail="User is not a member of this team"
        )
    
    # If setting as captain, check if team already has a captain
    if member_data.is_captain is True:
        from sqlalchemy import select
        stmt = select(User).where(
            User.team_id == team_id,
            User.is_captain == True,
            User.id != user_id
        )
        existing_captain = db.scalars(stmt).first()
        if existing_captain:
            raise HTTPException(
                status_code=400,
                detail="Team already has a captain. Remove current captain first."
            )
    
    # Update user fields
    if member_data.name is not None:
        user.name = member_data.name
    if member_data.email is not None:
        user.email = member_data.email
    if member_data.is_captain is not None:
        user.is_captain = member_data.is_captain
    
    db.commit()
    db.refresh(user)
    
    return TeamMemberResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        is_captain=user.is_captain
    )


@router.get("/team/{team_id}/members", status_code=200)
def get_team_members(
    team_id: int,
    db: Session = Depends(deps.get_db),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> List[TeamMemberResponse]:
    """
    Get all members of a team.
    """
    require_team_management_permission(auth=auth, curr_user=curr_user)
    
    # Check if team exists
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail=TEAM_NOT_FOUND_MESSAGE)
    
    # Get team members
    from sqlalchemy import select
    stmt = select(User).where(User.team_id == team_id)
    members = list(db.scalars(stmt).all())
    
    return [
        TeamMemberResponse(
            id=member.id,
            name=member.name,
            email=member.email,
            is_captain=member.is_captain
        )
        for member in members
    ]
