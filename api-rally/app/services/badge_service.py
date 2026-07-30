"""Persistence helpers for team badges.

Awards are idempotent: a team never receives the same (badge_type, activity)
twice, and globally-scoped badges (one holder per activity, e.g. "first to
complete") are guarded by an explicit holder check. Badges are permanent and
are never revoked here.
"""

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyConflictError, RallyNotFoundError
from app.crud import foreign_key_error_regex
from app.models.badge import TeamBadge
from app.models.badge_definition import BadgeDefinition

logger = logging.getLogger(__name__)

_team_foreign_error_regex = foreign_key_error_regex("team_id")


async def team_has_badge(
    db: AsyncSession,
    team_id: int,
    badge_code: str,
    activity_id: int | None,
    checkpoint_id: int | None = None,
) -> bool:
    """True when this team already holds this badge for this scope."""
    stmt = select(TeamBadge.id).where(
        TeamBadge.team_id == team_id,
        TeamBadge.badge_type == badge_code,
        TeamBadge.activity_id == activity_id,
        TeamBadge.checkpoint_id == checkpoint_id,
    )
    return (await db.scalars(stmt)).first() is not None


async def badge_holder_exists(
    db: AsyncSession,
    badge_code: str,
    activity_id: int | None,
    checkpoint_id: int | None = None,
) -> bool:
    """True when *any* team already holds this badge for this scope.

    Used by single-holder badges (e.g. first-to-complete) so the award is not
    handed out twice when results are edited after the fact.
    """
    stmt = select(TeamBadge.id).where(
        TeamBadge.badge_type == badge_code,
        TeamBadge.activity_id == activity_id,
        TeamBadge.checkpoint_id == checkpoint_id,
    )
    return (await db.scalars(stmt)).first() is not None


async def award_badge(
    db: AsyncSession,
    *,
    team_id: int,
    badge_code: str,
    activity_id: int | None = None,
    checkpoint_id: int | None = None,
    meta: dict[str, Any] | None = None,
) -> TeamBadge | None:
    """Award a badge, committing the row. No-op (returns None) if already held.

    ``badge_code`` is the BadgeDefinition.code (also what is stored in
    ``TeamBadge.badge_type``). The caller is responsible for any single-holder
    check; this only guards against the same team earning the same scope twice.
    """
    if await team_has_badge(db, team_id, badge_code, activity_id, checkpoint_id):
        return None

    badge = TeamBadge(
        team_id=team_id,
        badge_type=badge_code,
        activity_id=activity_id,
        checkpoint_id=checkpoint_id,
        meta=meta or {},
    )
    db.add(badge)
    await db.commit()
    await db.refresh(badge)
    logger.info(
        "Awarded badge %s to team %s (activity=%s)",
        badge_code,
        team_id,
        activity_id,
    )
    return badge


async def manual_award_badge(
    db: AsyncSession,
    *,
    team_id: int,
    badge_code: str,
    activity_id: int | None,
    checkpoint_id: int | None,
) -> TeamBadge:
    """Admin-initiated award, bypassing the automatic evaluators.

    Distinct from ``award_badge``: raises rather than no-oping on a duplicate
    (RallyConflictError, 409) so the admin sees the conflict, and maps a
    missing-team foreign-key violation to RallyNotFoundError (404) instead of
    surfacing the raw IntegrityError. The caller is responsible for verifying
    the badge definition exists and is active before calling this.
    """
    if await team_has_badge(db, team_id, badge_code, activity_id, checkpoint_id):
        raise RallyConflictError("Team already holds this badge")

    badge = TeamBadge(
        team_id=team_id,
        badge_type=badge_code,
        activity_id=activity_id,
        checkpoint_id=checkpoint_id,
        meta={"manual": True},
    )
    db.add(badge)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        if e.orig is not None and _team_foreign_error_regex.search(str(e.orig)):
            raise RallyNotFoundError("Team not found") from e
        raise RallyConflictError("Team already holds this badge") from e
    await db.refresh(badge)
    return badge


async def list_team_badges(db: AsyncSession, team_id: int) -> list[TeamBadge]:
    """All badges a team holds, newest first."""
    stmt = (
        select(TeamBadge).where(TeamBadge.team_id == team_id).order_by(TeamBadge.awarded_at.desc())
    )
    return list((await db.scalars(stmt)).all())


async def list_all_badges(db: AsyncSession) -> list[TeamBadge]:
    """Every awarded badge across all teams, newest first."""
    stmt = select(TeamBadge).order_by(TeamBadge.awarded_at.desc())
    return list((await db.scalars(stmt)).all())


async def get_showcase(
    db: AsyncSession, team_id: int
) -> tuple[list[BadgeDefinition], list[TeamBadge]]:
    """Return (active definitions, this team's awards) for the showcase board.

    Two selects, no join: the caller zips them by code so locked (unearned)
    badges still render. Only the earliest award per code matters for display,
    but we return all of the team's rows and let the schema layer collapse them.
    """
    defs_stmt = (
        select(BadgeDefinition)
        .where(BadgeDefinition.is_active.is_(True))
        .order_by(BadgeDefinition.id)
    )
    definitions = list((await db.scalars(defs_stmt)).all())
    earned = await list_team_badges(db, team_id)
    return definitions, earned
