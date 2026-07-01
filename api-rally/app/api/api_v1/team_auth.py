import logging
from typing import Annotated
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.config import settings
from app.core.redis import get_async_redis_client
from app.crud.crud_team import team as crud_team
from app.schemas.team_auth import TeamLoginRequest, TeamLoginResponse, TeamTokenData

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()


async def _check_login_rate_limit(request: Request) -> None:
    """Best-effort brute-force guard on team login, keyed by client IP.

    Uses a fixed-window Redis counter. Fails open when Redis is unavailable —
    the access codes remain the authoritative secret; this only slows guessing.
    """
    client_host = request.client.host if request.client else "unknown"
    key = f"rally:team-login:{client_host}"
    client = get_async_redis_client()
    try:
        attempts = await client.incr(key)
        if attempts == 1:
            await client.expire(key, settings.TEAM_LOGIN_RATE_LIMIT_WINDOW_SECONDS)
        if attempts > settings.TEAM_LOGIN_RATE_LIMIT_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts, try again later",
            )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — rate limit is best-effort
        logger.warning("Team login rate limit unavailable: %s", exc)
    finally:
        await client.aclose()


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


def _decode_team_token(token: str) -> dict:
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
    await _check_login_rate_limit(request)

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


@router.get("/verify")
def verify_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> TeamTokenData:
    """
    Verify a team JWT token.
    Returns the team data if valid.
    """
    token = credentials.credentials
    return verify_team_token(token)


@router.post("/refresh")
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
