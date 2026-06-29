from fastapi import APIRouter, Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict

from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.api import deps
from app.api.auth import AuthData, api_nei_auth
from app.api.abac_deps import require_view_team_members_permission, require_team_management_permission
from app.schemas.user import DetailedUser, UserCreate
from app.schemas.team_members import TeamMemberAdd, TeamMemberLink, TeamMemberResponse, TeamMemberUpdate
from app import crud
from app.models.user import User
from app.models.team import Team
from app.crud.crud_rally_settings import rally_settings

router = APIRouter()

# Constants
TEAM_NOT_FOUND_MESSAGE = "Team not found"
USER_NOT_FOUND_MESSAGE = "User not found"


@router.post("/team/{team_id}/members", status_code=201)
async def add_team_member(
    team_id: int,
    member_data: TeamMemberAdd,
    db: AsyncSession = Depends(deps.get_db),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> TeamMemberResponse:
    """
    Add a member to a team.
    """
    require_team_management_permission(auth=auth, curr_user=curr_user)

    # Check if team exists
    team = await db.get(Team, team_id)
    if not team:
        raise RallyNotFoundError(TEAM_NOT_FOUND_MESSAGE)

    # Check member limit
    from sqlalchemy import select, func
    settings = await rally_settings.get_or_create(db)
    count_stmt = select(func.count(User.id)).where(User.team_id == team_id)
    current_member_count = await db.scalar(count_stmt) or 0

    if current_member_count >= settings.max_members_per_team:
        raise RallyValidationError(f"Team member limit reached. Maximum {settings.max_members_per_team} members allowed per team.")

    # If setting as captain, check if team already has a captain
    if member_data.is_captain:
        captain_stmt = select(User).where(
            User.team_id == team_id,
            User.is_captain.is_(True)
        )
        existing_captain = (await db.scalars(captain_stmt)).first()
        if existing_captain:
            raise RallyValidationError("Team already has a captain. Remove current captain first.")

    # Create new user with auto-assigned ID
    user_data = UserCreate(
        name=member_data.name,
        email=member_data.email,
        team_id=team_id,
        is_captain=member_data.is_captain
    )
    user = await crud.user.create(db, obj_in=user_data)

    return TeamMemberResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        is_captain=user.is_captain
    )


@router.post("/team/{team_id}/members/{user_id}/link", status_code=200)
async def link_team_member(
    team_id: int,
    user_id: int,
    link_data: TeamMemberLink,
    db: AsyncSession = Depends(deps.get_db),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> TeamMemberResponse:
    """Link a name-only placeholder member to a real NEI (OIDC) account.

    ``user_id`` is the placeholder (a user row with no authentik_sub); the body
    carries the Authentik subject of the account chosen via search. If that
    account has never logged in, a local mirror is created for it. The
    placeholder's team membership is moved onto the account and the placeholder
    is removed, mirroring the self-service ``/profile/claim`` flow but
    admin-driven. A participation row is recorded for the event.
    """
    require_team_management_permission(auth=auth, curr_user=curr_user)

    team = await db.get(Team, team_id)
    if not team:
        raise RallyNotFoundError(TEAM_NOT_FOUND_MESSAGE)

    placeholder = await db.get(User, user_id)
    if placeholder is None:
        raise RallyNotFoundError(USER_NOT_FOUND_MESSAGE)
    if placeholder.team_id != team_id:
        raise RallyValidationError("User is not a member of this team")
    if placeholder.authentik_sub is not None:
        raise RallyValidationError("This member is already linked to an account")

    # Resolve the target account by its Authentik subject, mirroring it locally
    # if it has never logged in yet.
    target = await crud.user.get_by_authentik_sub(db, authentik_sub=link_data.authentik_sub)
    if target is None:
        target = await crud.user.create_for_oidc(
            db,
            authentik_sub=link_data.authentik_sub,
            name=link_data.name or placeholder.name,
            email=link_data.email,
            scopes=[],
        )
    if target.team_id is not None:
        raise RallyValidationError("Target account is already on a team")

    # Move the team membership onto the target account, drop the placeholder.
    target.team_id = placeholder.team_id
    target.is_captain = bool(placeholder.is_captain)
    db.add(target)
    await db.delete(placeholder)
    await db.flush()

    await crud.participation.record(
        db,
        authentik_sub=target.authentik_sub,
        event_id=team.event_id or (await crud.rally_event.ensure_current(db)).id,
        team=team,
        is_captain=bool(target.is_captain),
        commit=False,
    )
    await db.commit()
    await db.refresh(target)

    return TeamMemberResponse(
        id=target.id,
        name=target.name,
        email=target.email,
        is_captain=target.is_captain,
    )


@router.delete("/team/{team_id}/members/{user_id}", status_code=200)
async def remove_team_member(
    team_id: int,
    user_id: int,
    db: AsyncSession = Depends(deps.get_db),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> Dict[str, str]:
    """
    Remove a member from a team.
    """
    require_team_management_permission(auth=auth, curr_user=curr_user)

    # Check if team exists
    team = await db.get(Team, team_id)
    if not team:
        raise RallyNotFoundError(TEAM_NOT_FOUND_MESSAGE)

    # Check if user exists and is in this team
    user = await db.get(User, user_id)
    if not user:
        raise RallyNotFoundError(USER_NOT_FOUND_MESSAGE)

    if user.team_id != team_id:
        raise RallyValidationError("User is not a member of this team")

    # Remove user from team
    user.team_id = None
    await db.commit()

    return {"message": "Member removed from team successfully"}


@router.put("/team/{team_id}/members/{user_id}", status_code=200)
async def update_team_member(
    team_id: int,
    user_id: int,
    member_data: TeamMemberUpdate,
    db: AsyncSession = Depends(deps.get_db),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> TeamMemberResponse:
    """
    Update a team member's information.
    """
    require_team_management_permission(auth=auth, curr_user=curr_user)

    # Check if team exists
    team = await db.get(Team, team_id)
    if not team:
        raise RallyNotFoundError(TEAM_NOT_FOUND_MESSAGE)

    # Check if user exists and is in this team
    user = await db.get(User, user_id)
    if not user:
        raise RallyNotFoundError(USER_NOT_FOUND_MESSAGE)

    if user.team_id != team_id:
        raise RallyValidationError("User is not a member of this team")

    # If setting as captain, check if team already has a captain
    if member_data.is_captain is True:
        from sqlalchemy import select
        stmt = select(User).where(
            User.team_id == team_id,
            User.is_captain.is_(True),
            User.id != user_id
        )
        existing_captain = (await db.scalars(stmt)).first()
        if existing_captain:
            raise RallyValidationError("Team already has a captain. Remove current captain first.")

    # Update user fields
    if member_data.name is not None:
        user.name = member_data.name
    if member_data.email is not None:
        user.email = member_data.email
    if member_data.is_captain is not None:
        user.is_captain = member_data.is_captain

    await db.commit()
    await db.refresh(user)

    return TeamMemberResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        is_captain=user.is_captain
    )


@router.get("/team/{team_id}/members", status_code=200)
async def get_team_members(
    team_id: int,
    db: AsyncSession = Depends(deps.get_db),
    auth: AuthData = Security(api_nei_auth, scopes=[]),
    curr_user: DetailedUser = Depends(deps.get_participant),
) -> List[TeamMemberResponse]:
    """
    Get all members of a team.
    """
    require_view_team_members_permission(auth=auth, curr_user=curr_user)

    # Check if team exists
    team = await db.get(Team, team_id)
    if not team:
        raise RallyNotFoundError(TEAM_NOT_FOUND_MESSAGE)

    # Get team members
    from sqlalchemy import select
    stmt = select(User).where(User.team_id == team_id)
    members = list((await db.scalars(stmt)).all())

    return [
        TeamMemberResponse(
            id=member.id,
            name=member.name,
            email=member.email,
            is_captain=member.is_captain
        )
        for member in members
    ]
