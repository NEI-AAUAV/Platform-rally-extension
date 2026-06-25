"""Badge rules.

Each evaluator inspects a changed activity result and returns the badges that
should now exist. Evaluators own all *rule* logic (including single-holder
checks); the worker owns persistence and publishing. Evaluators are pure reads
— they never write — so re-running one is always safe.

Add a new badge by writing an ``async def evaluate_*`` and appending it to
``_EVALUATORS``.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityResult
from app.models.badge import BadgeType
from app.schemas.activity_types import ActivityType
from app.services import badge_service

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BadgeAward:
    """A badge that an evaluator decided a team should hold."""

    team_id: int
    badge_type: BadgeType
    activity_id: int | None = None
    meta: dict[str, Any] = field(default_factory=dict)


async def _evaluate_head_to_head_win(
    db: AsyncSession, result: ActivityResult
) -> list[BadgeAward]:
    """Award HEAD_TO_HEAD_WIN to a team that won a completed TeamVs match."""
    if not result.is_completed:
        return []
    activity = result.activity
    if activity is None or activity.activity_type != ActivityType.TEAM_VS.value:
        return []
    if (result.result_data or {}).get("result") != "win":
        return []

    return [
        BadgeAward(
            team_id=result.team_id,
            badge_type=BadgeType.HEAD_TO_HEAD_WIN,
            activity_id=result.activity_id,
            meta={"opponent_team_id": (result.result_data or {}).get("opponent_team_id")},
        )
    ]


async def _evaluate_first_to_complete(
    db: AsyncSession, result: ActivityResult
) -> list[BadgeAward]:
    """Award FIRST_TO_COMPLETE_ACTIVITY to the earliest team to finish it.

    Single-holder: skip if any team already holds it for this activity. The
    triggering result may not be the earliest, so award the actual first
    finisher rather than whoever fired this event.
    """
    if not result.is_completed:
        return []
    if await badge_service.badge_holder_exists(
        db, BadgeType.FIRST_TO_COMPLETE_ACTIVITY, result.activity_id
    ):
        return []

    stmt = (
        select(ActivityResult)
        .where(
            ActivityResult.activity_id == result.activity_id,
            ActivityResult.is_completed.is_(True),
            ActivityResult.completed_at.is_not(None),
        )
        .order_by(ActivityResult.completed_at.asc())
        .limit(1)
    )
    earliest = (await db.scalars(stmt)).first()
    if earliest is None:
        return []

    return [
        BadgeAward(
            team_id=earliest.team_id,
            badge_type=BadgeType.FIRST_TO_COMPLETE_ACTIVITY,
            activity_id=earliest.activity_id,
            meta={
                "completed_at": earliest.completed_at.isoformat()
                if earliest.completed_at
                else None
            },
        )
    ]


# Ordered registry of all result-driven evaluators.
_EVALUATORS: list[
    Callable[[AsyncSession, ActivityResult], Awaitable[list[BadgeAward]]]
] = [
    _evaluate_head_to_head_win,
    _evaluate_first_to_complete,
]


async def evaluate_result(
    db: AsyncSession, result: ActivityResult
) -> list[BadgeAward]:
    """Run every evaluator against a changed result and collect the awards.

    A failing evaluator is logged and skipped so one bad rule never blocks the
    others.
    """
    awards: list[BadgeAward] = []
    for evaluator in _EVALUATORS:
        try:
            awards.extend(await evaluator(db, result))
        except Exception:  # noqa: BLE001 — one rule must not break the rest
            logger.exception("Badge evaluator %s failed", evaluator.__name__)
    return awards
