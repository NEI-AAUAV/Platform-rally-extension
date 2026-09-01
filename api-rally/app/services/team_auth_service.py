"""Business rules for team self-serve JWT auth: token minting/verification,
refresh with an absolute session lifetime, and result contesting. Moved out
of app.api.api_v1.team_auth, which used to hold this logic as module-level
functions. Kept as module-level free functions here too (not a class) so the
existing direct-import call sites (tests, deps) keep working unchanged.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import RallyNotFoundError, RallyUnauthorizedError
from app.crud.crud_activity import activity_result as activity_result_crud
from app.models.activity import RallyEvent
from app.models.evaluation_history import EvaluationAction, EvaluationHistory
from app.models.team import Team
from app.schemas.evaluation_history import EvaluationHistoryEntry
from app.schemas.team_auth import TeamTokenData

logger = logging.getLogger(__name__)


def create_team_access_token(
    team_id: int,
    team_name: str,
    auth_version: int = 1,
    event_id: int = 1,
    orig_iat: int | None = None,
) -> str:
    """Create a JWT token for team authentication.

    ``orig_iat`` (epoch seconds of the original login) is carried across
    refreshes so the session has an absolute lifetime; omitted means "now".
    """
    now = datetime.now(UTC)
    expire = now + timedelta(hours=settings.TEAM_TOKEN_EXPIRE_HOURS)
    to_encode = {
        "team_id": team_id,
        "team_name": team_name,
        "auth_version": auth_version,
        "event_id": event_id,
        "exp": expire,
        "orig_iat": orig_iat if orig_iat is not None else int(now.timestamp()),
        "type": "team_access",
    }
    assert settings.TEAM_JWT_SECRET_KEY is not None  # validated at startup
    return jwt.encode(
        to_encode, settings.TEAM_JWT_SECRET_KEY, algorithm=settings.TEAM_JWT_ALGORITHM
    )


def decode_team_token(token: str) -> dict[str, Any]:
    """Decode and validate a team JWT, returning its full payload."""
    try:
        assert settings.TEAM_JWT_SECRET_KEY is not None  # validated at startup
        payload = jwt.decode(
            token, settings.TEAM_JWT_SECRET_KEY, algorithms=[settings.TEAM_JWT_ALGORITHM]
        )
        team_id = payload.get("team_id")
        team_name = payload.get("team_name")
        auth_version = payload.get("auth_version")
        event_id = payload.get("event_id")
        token_type = payload.get("type")

        if (
            not isinstance(team_id, int)
            or not isinstance(team_name, str)
            or not isinstance(auth_version, int)
            or isinstance(auth_version, bool)
            or not isinstance(event_id, int)
            or token_type != "team_access"
        ):
            logger.warning("Team token rejected: missing/invalid claims")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        return payload
    except JWTError as exc:
        logger.warning("Team token rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials"
        ) from exc


async def validate_team_token(db: AsyncSession, token: str) -> TeamTokenData:
    """Validate JWT claims against the live team and active edition.

    Missing version/edition claims are intentionally rejected, invalidating
    tokens minted before per-team revocation existed.
    """
    payload = decode_team_token(token)
    team = await db.get(Team, payload["team_id"])
    current_event_id = await db.scalar(select(RallyEvent.id).where(RallyEvent.is_current.is_(True)))
    if (
        team is None
        or team.name != payload["team_name"]
        or team.auth_version != payload["auth_version"]
        or current_event_id is None
        or payload["event_id"] != current_event_id
        or (team.event_id is not None and team.event_id != current_event_id)
    ):
        logger.info("Team token revoked or outside current edition: team_id=%s", payload["team_id"])
        raise RallyUnauthorizedError("Team session expired, please log in again")
    return TeamTokenData(team_id=team.id, team_name=team.name)


async def verify_team_token(db: AsyncSession, token: str) -> TeamTokenData:
    """Verify a team JWT and its live revocation state."""
    return await validate_team_token(db, token)


async def refresh_team_access_token(db: AsyncSession, token: str) -> dict[str, Any]:
    """Verify an existing team token's absolute session lifetime and mint a
    fresh one, returning {access_token, team_id, team_name}.

    Raises RallyUnauthorizedError once the session exceeds
    TEAM_TOKEN_MAX_LIFETIME_HOURS counted from the original login.
    """
    payload = decode_team_token(token)

    # Tokens minted before orig_iat existed count from now (single extra cycle).
    now = int(datetime.now(UTC).timestamp())
    orig_iat = int(payload.get("orig_iat") or now)

    max_lifetime_hours = settings.TEAM_TOKEN_MAX_LIFETIME_HOURS
    if max_lifetime_hours > 0 and now - orig_iat > max_lifetime_hours * 3600:
        logger.info("Team %s session expired at refresh (absolute lifetime)", payload["team_id"])
        raise RallyUnauthorizedError("Session expired, please log in again")

    team = await validate_team_token(db, token)
    new_access_token = create_team_access_token(
        team_id=team.team_id,
        team_name=team.team_name,
        auth_version=payload["auth_version"],
        event_id=payload["event_id"],
        orig_iat=orig_iat,
    )
    logger.info("Team %s token refreshed", payload["team_id"])
    return {
        "access_token": new_access_token,
        "team_id": team.team_id,
        "team_name": team.team_name,
    }


async def contest_evaluation(
    db: AsyncSession, *, result_id: int, current_team: TeamTokenData, reason: str | None
) -> EvaluationHistoryEntry:
    """Let a team dispute one of *its own* results.

    Appends a CONTESTED row to the audit trail with the team's reason. Does not
    change the score — it flags the result for an organizer to review. A team
    may only contest results belonging to itself.
    """
    db_result = await activity_result_crud.get(db, id=result_id)
    if not db_result or db_result.team_id != current_team.team_id:
        # Don't leak existence of other teams' results — same 404 either way.
        raise RallyNotFoundError("Activity result not found")

    entry = EvaluationHistory(
        result_id=result_id,
        action=EvaluationAction.CONTESTED.value,
        editor_id=str(current_team.team_id),
        editor_name=current_team.team_name,
        changes={},
        note=reason,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return EvaluationHistoryEntry.model_validate(entry)
