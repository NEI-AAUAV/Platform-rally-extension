"""Persistence helpers for team badges.

Awards are idempotent: a team never receives the same (badge_type, activity)
twice, and globally-scoped badges (one holder per activity, e.g. "first to
complete") are guarded by an explicit holder check. Badges are permanent and
are never revoked here.
"""

import logging
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.badge import BadgeType, TeamBadge

logger = logging.getLogger(__name__)


async def team_has_badge(
    db: AsyncSession,
    team_id: int,
    badge_type: BadgeType,
    activity_id: Optional[int],
    checkpoint_id: Optional[int] = None,
) -> bool:
    """True when this team already holds this badge for this scope."""
    stmt = select(TeamBadge.id).where(
        TeamBadge.team_id == team_id,
        TeamBadge.badge_type == badge_type.value,
        TeamBadge.activity_id == activity_id,
        TeamBadge.checkpoint_id == checkpoint_id,
    )
    return (await db.scalars(stmt)).first() is not None


async def badge_holder_exists(
    db: AsyncSession,
    badge_type: BadgeType,
    activity_id: Optional[int],
    checkpoint_id: Optional[int] = None,
) -> bool:
    """True when *any* team already holds this badge for this scope.

    Used by single-holder badges (e.g. first-to-complete) so the award is not
    handed out twice when results are edited after the fact.
    """
    stmt = select(TeamBadge.id).where(
        TeamBadge.badge_type == badge_type.value,
        TeamBadge.activity_id == activity_id,
        TeamBadge.checkpoint_id == checkpoint_id,
    )
    return (await db.scalars(stmt)).first() is not None


async def award_badge(
    db: AsyncSession,
    *,
    team_id: int,
    badge_type: BadgeType,
    activity_id: Optional[int] = None,
    checkpoint_id: Optional[int] = None,
    meta: Optional[dict[str, Any]] = None,
) -> Optional[TeamBadge]:
    """Award a badge, committing the row. No-op (returns None) if already held.

    The caller is responsible for any single-holder check; this only guards
    against the same team earning the same scope twice.
    """
    if await team_has_badge(db, team_id, badge_type, activity_id, checkpoint_id):
        return None

    badge = TeamBadge(
        team_id=team_id,
        badge_type=badge_type.value,
        activity_id=activity_id,
        checkpoint_id=checkpoint_id,
        meta=meta or {},
    )
    db.add(badge)
    await db.commit()
    await db.refresh(badge)
    logger.info(
        "Awarded badge %s to team %s (activity=%s)",
        badge_type.value,
        team_id,
        activity_id,
    )
    return badge


async def list_team_badges(db: AsyncSession, team_id: int) -> list[TeamBadge]:
    """All badges a team holds, newest first."""
    stmt = (
        select(TeamBadge)
        .where(TeamBadge.team_id == team_id)
        .order_by(TeamBadge.awarded_at.desc())
    )
    return list((await db.scalars(stmt)).all())


async def list_all_badges(db: AsyncSession) -> list[TeamBadge]:
    """Every awarded badge across all teams, newest first."""
    stmt = select(TeamBadge).order_by(TeamBadge.awarded_at.desc())
    return list((await db.scalars(stmt)).all())
