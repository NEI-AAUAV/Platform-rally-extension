from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api import deps
from app.api.rate_limit import check_login_rate_limit, rate_limit
from app.core.config import SettingsDep, settings
from app.core.exceptions import RallyUnauthorizedError
from app.crud.crud_team import CRUDTeam
from app.crud.deps import get_team_crud
from app.schemas.evaluation_history import ContestRequest, EvaluationHistoryEntry
from app.schemas.team_auth import TeamLoginRequest, TeamLoginResponse, TeamTokenData
from app.services.team_auth_service import (
    contest_evaluation as _contest_evaluation,
)
from app.services.team_auth_service import (
    create_team_access_token,
    refresh_team_access_token,
    verify_team_token,
)

security = HTTPBearer()

# Coarse guard on token verify/refresh (authenticated, client-driven).
_write_rate_limit = rate_limit(
    "team-token",
    settings.WRITE_RATE_LIMIT_ATTEMPTS,
    settings.WRITE_RATE_LIMIT_WINDOW_SECONDS,
)


class TeamAuthController:
    """REST controller for team login, token verify/refresh, and result contests."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route("/login", self.team_login, methods=["POST"], name="team_login")
        self.router.add_api_route(
            "/verify",
            self.verify_token,
            methods=["GET"],
            name="verify_token",
            dependencies=[Depends(_write_rate_limit)],
        )
        self.router.add_api_route(
            "/refresh",
            self.refresh_team_token,
            methods=["POST"],
            name="refresh_team_token",
            dependencies=[Depends(_write_rate_limit)],
        )
        self.router.add_api_route(
            "/evaluations/{result_id}/contest",
            self.contest_evaluation,
            methods=["POST"],
            name="contest_evaluation",
            dependencies=[Depends(_write_rate_limit)],
            responses={404: {"description": "Activity result not found"}},
        )

    async def team_login(
        self,
        login_data: TeamLoginRequest,
        request: Request,
        db: deps.SessionDep,
        settings: SettingsDep,
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
    ) -> TeamLoginResponse:
        """
        Authenticate a team using their access code.
        Returns a JWT token for subsequent requests.
        """
        await check_login_rate_limit(request, login_data.access_code, settings)

        team = await team_crud.get_by_access_code(db, access_code=login_data.access_code)
        if not team:
            raise RallyUnauthorizedError("Invalid access code")

        access_token = create_team_access_token(team_id=team.id, team_name=team.name)
        return TeamLoginResponse(access_token=access_token, team_id=team.id, team_name=team.name)

    def verify_token(
        self,
        credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    ) -> TeamTokenData:
        """
        Verify a team JWT token.
        Returns the team data if valid.
        """
        return verify_team_token(credentials.credentials)

    def refresh_team_token(
        self,
        credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    ) -> TeamLoginResponse:
        """
        Refresh a team JWT token.
        Takes an existing team token and returns a new one with extended expiration,
        up to an absolute session lifetime (TEAM_TOKEN_MAX_LIFETIME_HOURS) counted
        from the original login.
        """
        result = refresh_team_access_token(credentials.credentials)
        return TeamLoginResponse(**result)

    async def contest_evaluation(
        self,
        *,
        result_id: int,
        contest_in: ContestRequest,
        db: deps.SessionDep,
        current_team: Annotated[TeamTokenData, Depends(deps.get_current_team)],
    ) -> EvaluationHistoryEntry:
        """Let a team dispute one of *its own* results.

        Appends a CONTESTED row to the audit trail with the team's reason. Does not
        change the score — it flags the result for an organizer to review. A team
        may only contest results belonging to itself.
        """
        return await _contest_evaluation(
            db, result_id=result_id, current_team=current_team, reason=contest_in.reason
        )


router = TeamAuthController().router
