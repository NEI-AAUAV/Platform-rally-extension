import logging
from typing import Annotated, Any
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.rate_limit import check_login_rate_limit, rate_limit
from app.core.config import settings
from app.crud.crud_team import team as crud_team
from app.schemas.team_auth import TeamLoginRequest, TeamLoginResponse, TeamTokenData

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
    db: Annotated[AsyncSession, Depends(deps.get_db)]
) -> TeamLoginResponse:
    """
    Authenticate a team using their access code.
    Returns a JWT token for subsequent requests.
    """
    await check_login_rate_limit(request, login_data.access_code)

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
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
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
