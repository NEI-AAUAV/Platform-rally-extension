from typing import Annotated

from fastapi import APIRouter, Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.abac_deps import (
    require_team_management_permission,
    require_view_team_members_permission,
)
from app.api.auth import AuthData, api_nei_auth
from app.schemas.team_members import (
    TeamMemberAdd,
    TeamMemberLink,
    TeamMemberResponse,
    TeamMemberUpdate,
)
from app.schemas.user import DetailedUser
from app.services.team_member_service import TeamMemberService

router = APIRouter()


@router.post("/team/{team_id}/members", status_code=201)
async def add_team_member(
    team_id: int,
    member_data: TeamMemberAdd,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
) -> TeamMemberResponse:
    """Add a member to a team."""
    require_team_management_permission(auth=auth, curr_user=curr_user)

    user = await TeamMemberService(db).add_member(
        team_id, member_data, is_privileged=deps.is_admin(auth.scopes)
    )
    return TeamMemberResponse(
        id=user.id, name=user.name, email=user.email, is_captain=user.is_captain
    )


@router.post("/team/{team_id}/members/{user_id}/link", status_code=200)
async def link_team_member(
    team_id: int,
    user_id: int,
    link_data: TeamMemberLink,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
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

    service = TeamMemberService(db)
    team = await service.get_team_or_raise(team_id)
    placeholder = await service.get_team_member_or_raise(team_id, user_id)

    target = await service.link_placeholder_to_authentik_account(
        team=team,
        placeholder=placeholder,
        authentik_sub=link_data.authentik_sub,
        name=link_data.name,
        email=link_data.email,
    )

    return TeamMemberResponse(
        id=target.id,
        name=target.name,
        email=target.email,
        is_captain=target.is_captain,
        is_linked=True,
    )


@router.post("/team/{team_id}/members/{user_id}/link-self", status_code=200)
async def link_self_team_member(
    team_id: int,
    user_id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> TeamMemberResponse:
    """Self-serve variant of ``link_team_member``.

    Lets whoever holds a team access-code session claim a placeholder slot in
    that team using the NEI (OIDC) account they just logged in with.

    The client can only send a single bearer token per request, and it
    switches to the OIDC token as soon as this NEI login completes — so
    ``team_id`` cannot be proven via the (now unavailable) team token here.
    Instead the frontend captures ``team_id`` right before the OIDC redirect
    and passes it explicitly; this is safe because the target placeholder
    must both belong to that team *and* have no ``authentik_sub`` yet
    (enforced below), so a caller can only ever claim an actually-open slot.
    """
    service = TeamMemberService(db)
    team_obj = await service.get_team_or_raise(team_id)
    placeholder = await service.get_team_member_or_raise(team_id, user_id)

    target = await service.link_placeholder_to_authentik_account(
        team=team_obj,
        placeholder=placeholder,
        authentik_sub=auth.oidc_sub,
        name=auth.name,
        email=auth.email,
    )

    return TeamMemberResponse(
        id=target.id,
        name=target.name,
        email=target.email,
        is_captain=target.is_captain,
        is_linked=True,
    )


@router.delete("/team/{team_id}/members/{user_id}", status_code=200)
async def remove_team_member(
    team_id: int,
    user_id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
) -> dict[str, str]:
    """Remove a member from a team."""
    require_team_management_permission(auth=auth, curr_user=curr_user)

    await TeamMemberService(db).remove_member(team_id, user_id)
    return {"message": "Member removed from team successfully"}


@router.put("/team/{team_id}/members/{user_id}", status_code=200)
async def update_team_member(
    team_id: int,
    user_id: int,
    member_data: TeamMemberUpdate,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
) -> TeamMemberResponse:
    """Update a team member's information."""
    require_team_management_permission(auth=auth, curr_user=curr_user)

    user = await TeamMemberService(db).update_member(team_id, user_id, member_data)
    return TeamMemberResponse(
        id=user.id, name=user.name, email=user.email, is_captain=user.is_captain
    )


@router.get("/team/{team_id}/members", status_code=200)
async def get_team_members(
    team_id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
) -> list[TeamMemberResponse]:
    """Get all members of a team."""
    require_view_team_members_permission(auth=auth, curr_user=curr_user)

    members = await TeamMemberService(db).list_members(team_id)
    return [
        TeamMemberResponse(
            id=member.id,
            name=member.name,
            email=member.email,
            is_captain=member.is_captain,
            is_linked=member.authentik_sub is not None,
        )
        for member in members
    ]
