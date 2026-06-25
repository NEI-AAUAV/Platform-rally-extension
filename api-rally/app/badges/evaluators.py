"""Badge rules.

Each evaluator inspects a changed activity result and returns the badges that
should now exist. Evaluators own all *rule* logic (including single-holder
checks); the worker owns persistence and publishing. Evaluators are pure reads
— they never write — so re-running one is always safe.

Add a new badge by writing an ``async def evaluate_*`` and appending it to
``_EVALUATORS``.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity, ActivityResult
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
    checkpoint_id: int | None = None
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


async def _evaluate_first_to_complete_checkpoint(
    db: AsyncSession, result: ActivityResult
) -> list[BadgeAward]:
    """Award FIRST_TO_COMPLETE_CHECKPOINT to the first team to finish a checkpoint.

    A checkpoint is "completed" by a team when it has a completed result for
    every active activity in that checkpoint. The winner is the team whose last
    such result landed earliest. Single-holder per checkpoint.
    """
    if not result.is_completed:
        return []
    activity = result.activity
    if activity is None:
        return []
    checkpoint_id = activity.checkpoint_id

    if await badge_service.badge_holder_exists(
        db, BadgeType.FIRST_TO_COMPLETE_CHECKPOINT, None, checkpoint_id
    ):
        return []

    activity_ids = set(
        (
            await db.scalars(
                select(Activity.id).where(
                    Activity.checkpoint_id == checkpoint_id,
                    Activity.is_active.is_(True),
                )
            )
        ).all()
    )
    if not activity_ids:
        return []

    completed = (
        await db.scalars(
            select(ActivityResult).where(
                ActivityResult.activity_id.in_(activity_ids),
                ActivityResult.is_completed.is_(True),
                ActivityResult.completed_at.is_not(None),
            )
        )
    ).all()

    # Per team: the activities it finished and when it finished its last one.
    done: dict[int, set[int]] = defaultdict(set)
    last_finish: dict[int, datetime] = {}
    for r in completed:
        done[r.team_id].add(r.activity_id)
        if r.completed_at is not None:
            prev = last_finish.get(r.team_id)
            last_finish[r.team_id] = (
                r.completed_at if prev is None else max(prev, r.completed_at)
            )

    finishers = [
        (team_id, last_finish[team_id])
        for team_id, acts in done.items()
        if activity_ids <= acts
    ]
    if not finishers:
        return []

    winner_team, finished_at = min(finishers, key=lambda pair: pair[1])
    return [
        BadgeAward(
            team_id=winner_team,
            badge_type=BadgeType.FIRST_TO_COMPLETE_CHECKPOINT,
            checkpoint_id=checkpoint_id,
            meta={"completed_at": finished_at.isoformat()},
        )
    ]


# Ordered registry of all result-driven evaluators.
_EVALUATORS: list[
    Callable[[AsyncSession, ActivityResult], Awaitable[list[BadgeAward]]]
] = [
    _evaluate_head_to_head_win,
    _evaluate_first_to_complete,
    _evaluate_first_to_complete_checkpoint,
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
