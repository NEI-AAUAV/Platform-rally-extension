from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api import deps
from app.api.rate_limit import check_login_rate_limit, rate_limit
from app.core.config import SettingsDep, settings
from app.core.exceptions import RallyUnauthorizedError
from app.crud.crud_team import team as crud_team
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

router = APIRouter()
security = HTTPBearer()

# Coarse guard on token verify/refresh (authenticated, client-driven).
_write_rate_limit = rate_limit(
    "team-token",
    settings.WRITE_RATE_LIMIT_ATTEMPTS,
    settings.WRITE_RATE_LIMIT_WINDOW_SECONDS,
)


@router.post("/login")
async def team_login(
    login_data: TeamLoginRequest,
    request: Request,
    db: deps.SessionDep,
    settings: SettingsDep,
) -> TeamLoginResponse:
    """
    Authenticate a team using their access code.
    Returns a JWT token for subsequent requests.
    """
    await check_login_rate_limit(request, login_data.access_code, settings)

    team = await crud_team.get_by_access_code(db, access_code=login_data.access_code)
    if not team:
        raise RallyUnauthorizedError("Invalid access code")

    access_token = create_team_access_token(team_id=team.id, team_name=team.name)
    return TeamLoginResponse(access_token=access_token, team_id=team.id, team_name=team.name)


@router.get("/verify", dependencies=[Depends(_write_rate_limit)])
def verify_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> TeamTokenData:
    """
    Verify a team JWT token.
    Returns the team data if valid.
    """
    return verify_team_token(credentials.credentials)


@router.post("/refresh", dependencies=[Depends(_write_rate_limit)])
def refresh_team_token(
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


@router.post(
    "/evaluations/{result_id}/contest",
    dependencies=[Depends(_write_rate_limit)],
    responses={404: {"description": "Activity result not found"}},
)
async def contest_evaluation(
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
