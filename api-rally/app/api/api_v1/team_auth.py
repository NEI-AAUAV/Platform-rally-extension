import logging
from typing import Annotated, Any
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.rate_limit import check_login_rate_limit, rate_limit
from app.core.config import SettingsDep, settings
from app.crud.crud_team import team as crud_team
from app.schemas.team_auth import TeamLoginRequest, TeamLoginResponse, TeamTokenData
from app.schemas.evaluation_history import ContestRequest, EvaluationHistoryEntry

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()

# Coarse guard on token verify/refresh (authenticated, client-driven).
_write_rate_limit = rate_limit(
    "team-token",
    settings.WRITE_RATE_LIMIT_ATTEMPTS,
    settings.WRITE_RATE_LIMIT_WINDOW_SECONDS,
)


def create_team_access_token(
    team_id: int, team_name: str, orig_iat: int | None = None
) -> str:
    """Create a JWT token for team authentication.

    ``orig_iat`` (epoch seconds of the original login) is carried across
    refreshes so the session has an absolute lifetime; omitted means "now".
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=settings.TEAM_TOKEN_EXPIRE_HOURS)
    to_encode = {
        "team_id": team_id,
        "team_name": team_name,
        "exp": expire,
        "orig_iat": orig_iat if orig_iat is not None else int(now.timestamp()),
        "type": "team_access"
    }
    assert settings.TEAM_JWT_SECRET_KEY is not None  # validated at startup
    encoded_jwt = jwt.encode(
        to_encode,
        settings.TEAM_JWT_SECRET_KEY,
        algorithm=settings.TEAM_JWT_ALGORITHM
    )
    return encoded_jwt


def verify_team_token(token: str) -> TeamTokenData:
    """Verify and decode a team JWT token"""
    payload = _decode_team_token(token)
    return TeamTokenData(team_id=payload["team_id"], team_name=payload["team_name"])


def _decode_team_token(token: str) -> dict[str, Any]:
    """Decode and validate a team JWT, returning its full payload."""
    try:
        assert settings.TEAM_JWT_SECRET_KEY is not None  # validated at startup
        payload = jwt.decode(
            token,
            settings.TEAM_JWT_SECRET_KEY,
            algorithms=[settings.TEAM_JWT_ALGORITHM]
        )
        team_id = payload.get("team_id")
        team_name = payload.get("team_name")
        token_type = payload.get("type")

        if team_id is None or team_name is None or token_type != "team_access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )

        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )


@router.post("/login")
async def team_login(
    login_data: TeamLoginRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    settings: SettingsDep,
) -> TeamLoginResponse:
    """
    Authenticate a team using their access code.
    Returns a JWT token for subsequent requests.
    """
    await check_login_rate_limit(request, login_data.access_code, settings)

    # Find team by access code
    team = await crud_team.get_by_access_code(db, access_code=login_data.access_code)

    if not team:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access code",
        )

    # Create access token
    access_token = create_team_access_token(team_id=team.id, team_name=team.name)

    return TeamLoginResponse(
        access_token=access_token,
        team_id=team.id,
        team_name=team.name
    )


@router.get("/verify", dependencies=[Depends(_write_rate_limit)])
def verify_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> TeamTokenData:
    """
    Verify a team JWT token.
    Returns the team data if valid.
    """
    token = credentials.credentials
    return verify_team_token(token)


@router.post("/refresh", dependencies=[Depends(_write_rate_limit)])
def refresh_team_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    settings: SettingsDep,
) -> TeamLoginResponse:
    """
    Refresh a team JWT token.
    Takes an existing team token and returns a new one with extended expiration,
    up to an absolute session lifetime (TEAM_TOKEN_MAX_LIFETIME_HOURS) counted
    from the original login.
    """
    token = credentials.credentials
    payload = _decode_team_token(token)

    # Tokens minted before orig_iat existed count from now (single extra cycle).
    now = int(datetime.now(timezone.utc).timestamp())
    orig_iat = int(payload.get("orig_iat") or now)

    max_lifetime_hours = settings.TEAM_TOKEN_MAX_LIFETIME_HOURS
    if max_lifetime_hours > 0 and now - orig_iat > max_lifetime_hours * 3600:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired, please log in again",
        )

    new_access_token = create_team_access_token(
        team_id=payload["team_id"],
        team_name=payload["team_name"],
        orig_iat=orig_iat,
    )

    return TeamLoginResponse(
        access_token=new_access_token,
        team_id=payload["team_id"],
        team_name=payload["team_name"]
    )


@router.post(
    "/evaluations/{result_id}/contest",
    dependencies=[Depends(_write_rate_limit)],
    responses={404: {"description": "Activity result not found"}},
)
async def contest_evaluation(
    *,
    result_id: int,
    contest_in: ContestRequest,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    current_team: Annotated[TeamTokenData, Depends(deps.get_current_team)],
) -> EvaluationHistoryEntry:
    """Let a team dispute one of *its own* results.

    Appends a CONTESTED row to the audit trail with the team's reason. Does not
    change the score — it flags the result for an organizer to review. A team
    may only contest results belonging to itself.
    """
    from app.crud.crud_activity import activity_result as activity_result_crud
    from app.models.evaluation_history import EvaluationHistory, EvaluationAction

    db_result = await activity_result_crud.get(db, id=result_id)
    if not db_result:
        raise HTTPException(status_code=404, detail="Activity result not found")
    if db_result.team_id != current_team.team_id:
        # Don't leak existence of other teams' results — same 404.
        raise HTTPException(status_code=404, detail="Activity result not found")

    entry = EvaluationHistory(
        result_id=result_id,
        action=EvaluationAction.CONTESTED.value,
        editor_id=str(current_team.team_id),
        editor_name=current_team.team_name,
        changes={},
        note=contest_in.reason,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return EvaluationHistoryEntry.model_validate(entry)
