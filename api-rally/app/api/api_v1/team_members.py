from typing import Annotated

from fastapi import APIRouter, Depends, Request, Security

from app.api import authentik_client, deps
from app.api.abac_deps import (
    require_add_team_member_permission,
    require_team_management_permission,
    require_view_team_members_permission,
)
from app.api.auth import AuthData, api_nei_auth
from app.api.authentik_client import AuthentikUnavailableError, AuthentikUser
from app.api.rate_limit import check_login_rate_limit
from app.core.config import SettingsDep
from app.core.exceptions import RallyConflictError, RallyForbiddenError, RallyValidationError
from app.schemas.team_members import (
    TeamMemberAdd,
    TeamMemberLink,
    TeamMemberLinkSelf,
    TeamMemberResponse,
    TeamMemberUpdate,
)
from app.schemas.user import DetailedUser
from app.services.deps import get_team_member_service
from app.services.team_member_service import INVALID_ACCESS_CODE_MESSAGE, TeamMemberService


async def _resolve_authentik_account(link_data: TeamMemberLink) -> AuthentikUser:
    """The account to link, as Authentik knows it.

    With the management API configured the body's name/email are ignored and
    re-read from Authentik, so a request cannot pair one account's uuid with
    another person's email. Without it, search only lists already-mirrored local
    accounts, and the body is all there is.
    """
    if not authentik_client.is_configured():
        return AuthentikUser(
            authentik_sub=link_data.authentik_sub,
            name=link_data.name or "",
            username="",
            email=link_data.email,
        )
    try:
        account = await authentik_client.get_user(link_data.authentik_sub)
    except AuthentikUnavailableError:
        raise RallyConflictError(
            "Não foi possível contactar o Authentik. Tenta novamente."
        ) from None
    if account is None:
        raise RallyValidationError("Conta NEI não encontrada")
    return account


class TeamMembersController:
    """REST controller for team roster management."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/team/{team_id}/members",
            self.add_team_member,
            methods=["POST"],
            status_code=201,
            name="add_team_member",
        )
        self.router.add_api_route(
            "/team/{team_id}/members/{user_id}/link",
            self.link_team_member,
            methods=["POST"],
            status_code=200,
            name="link_team_member",
        )
        self.router.add_api_route(
            "/team/{team_id}/members/{user_id}/link-self",
            self.link_self_team_member,
            methods=["POST"],
            status_code=200,
            name="link_self_team_member",
        )
        self.router.add_api_route(
            "/team/{team_id}/members/{user_id}",
            self.remove_team_member,
            methods=["DELETE"],
            status_code=200,
            name="remove_team_member",
        )
        self.router.add_api_route(
            "/team/{team_id}/members/{user_id}",
            self.update_team_member,
            methods=["PUT"],
            status_code=200,
            name="update_team_member",
        )
        self.router.add_api_route(
            "/team/{team_id}/members",
            self.get_team_members,
            methods=["GET"],
            status_code=200,
            name="get_team_members",
        )

    async def add_team_member(
        self,
        team_id: int,
        member_data: TeamMemberAdd,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[TeamMemberService, Depends(get_team_member_service)],
    ) -> TeamMemberResponse:
        """Add a member to a team."""
        require_add_team_member_permission(auth=auth, curr_user=curr_user)

        user = await service.add_member(
            team_id, member_data, is_privileged=deps.is_admin_or_manager(auth.scopes)
        )
        return TeamMemberResponse(
            id=user.id, name=user.name, email=user.email, is_captain=user.is_captain
        )

    async def link_team_member(
        self,
        team_id: int,
        user_id: int,
        link_data: TeamMemberLink,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[TeamMemberService, Depends(get_team_member_service)],
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

        team = await service.get_team_or_raise(team_id)
        account = await _resolve_authentik_account(link_data)
        target = await service.link_with_authentik_account(
            team=team, user_id=user_id, account=account
        )

        return TeamMemberResponse(
            id=target.id,
            name=target.name,
            email=target.email,
            is_captain=target.is_captain,
            is_linked=True,
        )

    async def link_self_team_member(
        self,
        team_id: int,
        user_id: int,
        link_data: TeamMemberLinkSelf,
        request: Request,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[TeamMemberService, Depends(get_team_member_service)],
        settings: SettingsDep,
    ) -> TeamMemberResponse:
        """Self-serve variant of ``link_team_member``.

        Lets whoever holds a team's access code claim a placeholder slot in that
        team using the NEI (OIDC) account they just logged in with.

        The client can only send a single bearer token per request, and it
        switches to the OIDC token as soon as this NEI login completes — so
        team membership cannot be proven via the (now unavailable) team token
        here. The caller therefore re-presents the team access code, which is
        what binds them to ``team_id``; the OIDC bearer only says *who* they are.
        Placeholder state alone is not authorization: without the code check any
        authenticated user could claim any team's open slot.
        """
        await check_login_rate_limit(request, link_data.access_code, settings)
        # Same 403 for an unknown team and a wrong code, so the endpoint cannot
        # be used to enumerate team ids.
        team_obj = await service.find_team(team_id)
        if team_obj is None:
            raise RallyForbiddenError(INVALID_ACCESS_CODE_MESSAGE)
        service.assert_team_access_code(team_obj, link_data.access_code)

        target = await service.link_self(
            team=team_obj,
            user_id=user_id,
            auth=auth,
            # Same rule as first login: only a verified email may claim an
            # existing unclaimed row by address.
            adopt_by_email=bool(auth.email_verified or settings.OIDC_TRUST_UNVERIFIED_EMAIL),
        )

        return TeamMemberResponse(
            id=target.id,
            name=target.name,
            email=target.email,
            is_captain=target.is_captain,
            is_linked=True,
        )

    async def remove_team_member(
        self,
        team_id: int,
        user_id: int,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[TeamMemberService, Depends(get_team_member_service)],
    ) -> dict[str, str]:
        """Remove a member from a team."""
        require_team_management_permission(auth=auth, curr_user=curr_user)

        await service.remove_member(team_id, user_id)
        return {"message": "Member removed from team successfully"}

    async def update_team_member(
        self,
        team_id: int,
        user_id: int,
        member_data: TeamMemberUpdate,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[TeamMemberService, Depends(get_team_member_service)],
    ) -> TeamMemberResponse:
        """Update a team member's information."""
        require_team_management_permission(auth=auth, curr_user=curr_user)

        user = await service.update_member(team_id, user_id, member_data)
        return TeamMemberResponse(
            id=user.id, name=user.name, email=user.email, is_captain=user.is_captain
        )

    async def get_team_members(
        self,
        team_id: int,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[TeamMemberService, Depends(get_team_member_service)],
    ) -> list[TeamMemberResponse]:
        """Get all members of a team."""
        require_view_team_members_permission(auth=auth, curr_user=curr_user)

        members = await service.list_members(team_id)
        return [
            TeamMemberResponse(
                id=member.id,
                name=member.name,
                email=member.email,
                is_captain=member.is_captain,
                is_linked=member.is_linked,
            )
            for member in members
        ]


router = TeamMembersController().router
