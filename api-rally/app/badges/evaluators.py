"""Data-driven badge rules.

A badge's award behaviour is *configured*, not hardcoded: each active auto
``BadgeDefinition`` names a ``trigger_type`` (a :class:`BadgeTrigger`) plus a
``criteria`` dict. ``evaluate_result`` loads those definitions and dispatches to
the matching handler, so an admin can create new auto badges from the UI with no
code change.

Handlers are pure reads — they never write — so re-running one is always safe.
Each returns the badges that *should now exist*; the worker owns persistence.

To add a new rule *kind*: add a ``BadgeTrigger`` value, write an
``async def _handle_*`` taking ``(db, result, defn)``, and register it in
``_TRIGGER_HANDLERS``. To add a badge that reuses an existing rule: pure admin
data entry, no change here.
"""

import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.badges.triggers import BadgeTrigger
from app.models.activity import Activity, ActivityResult
from app.models.badge_definition import BadgeDefinition
from app.schemas.activity_types import ActivityType
from app.services import badge_service

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BadgeAward:
    """A badge that an evaluator decided a team should hold."""

    team_id: int
    badge_code: str
    activity_id: int | None = None
    checkpoint_id: int | None = None
    meta: dict[str, Any] = field(default_factory=dict)


Handler = Callable[[AsyncSession, ActivityResult, BadgeDefinition], Awaitable[list[BadgeAward]]]


async def _handle_win_activity(
    db: AsyncSession, result: ActivityResult, defn: BadgeDefinition
) -> list[BadgeAward]:
    """Award to a team that won a completed match.

    Criteria (all optional):
      - ``activity_type``: which activity type counts (default ``TeamVsActivity``).
      - ``activity_id``: restrict to one activity; omit for any.
    """
    if not result.is_completed:
        return []
    activity = result.activity or await db.get(Activity, result.activity_id)
    if activity is None:
        return []

    criteria = defn.criteria or {}
    wanted_type = criteria.get("activity_type", ActivityType.TEAM_VS.value)
    if activity.activity_type != wanted_type:
        return []
    scoped_activity = criteria.get("activity_id")
    if scoped_activity is not None and result.activity_id != scoped_activity:
        return []
    if (result.result_data or {}).get("result") != "win":
        return []

    return [
        BadgeAward(
            team_id=result.team_id,
            badge_code=defn.code,
            activity_id=result.activity_id,
            meta={"opponent_team_id": (result.result_data or {}).get("opponent_team_id")},
        )
    ]


async def _handle_first_complete_activity(
    db: AsyncSession, result: ActivityResult, defn: BadgeDefinition
) -> list[BadgeAward]:
    """Award to the earliest team to finish an activity (single-holder).

    Criteria (optional):
      - ``activity_id``: restrict to one activity; omit for any completed activity.

    The triggering result may not be the earliest, so award the actual first
    finisher rather than whoever fired this event.
    """
    if not result.is_completed:
        return []

    criteria = defn.criteria or {}
    scoped_activity = criteria.get("activity_id")
    if scoped_activity is not None and result.activity_id != scoped_activity:
        return []

    if await badge_service.badge_holder_exists(db, defn.code, result.activity_id):
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
            badge_code=defn.code,
            activity_id=earliest.activity_id,
            meta={
                "completed_at": earliest.completed_at.isoformat() if earliest.completed_at else None
            },
        )
    ]


async def _handle_first_complete_checkpoint(
    db: AsyncSession, result: ActivityResult, defn: BadgeDefinition
) -> list[BadgeAward]:
    """Award to the first team to complete every active activity of a checkpoint.

    A team "completes" a checkpoint when it has a completed result for every
    active activity in it. Winner = team whose last such result landed earliest.
    Single-holder per checkpoint.

    Criteria (optional):
      - ``checkpoint_id``: restrict to one checkpoint; omit for the triggering
        result's checkpoint.
    """
    if not result.is_completed:
        return []
    activity = result.activity
    if activity is None:
        return []

    criteria = defn.criteria or {}
    checkpoint_id = criteria.get("checkpoint_id", activity.checkpoint_id)
    if checkpoint_id is None:
        return []
    # If scoped to a specific checkpoint, only react to results within it.
    if criteria.get("checkpoint_id") is not None and activity.checkpoint_id != checkpoint_id:
        return []

    if await badge_service.badge_holder_exists(db, defn.code, None, checkpoint_id):
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
            last_finish[r.team_id] = r.completed_at if prev is None else max(prev, r.completed_at)

    finishers = [
        (team_id, last_finish[team_id]) for team_id, acts in done.items() if activity_ids <= acts
    ]
    if not finishers:
        return []

    winner_team, finished_at = min(finishers, key=lambda pair: pair[1])
    return [
        BadgeAward(
            team_id=winner_team,
            badge_code=defn.code,
            checkpoint_id=checkpoint_id,
            meta={"completed_at": finished_at.isoformat()},
        )
    ]


async def _team_completed_activity_ids(
    db: AsyncSession, team_id: int, activity_ids: set[int] | None = None
) -> set[int]:
    """The set of distinct activity ids a team has a completed result for.

    Restricted to ``activity_ids`` when given (used to check checkpoint/rally
    coverage without scanning the whole results table).
    """
    stmt = select(ActivityResult.activity_id).where(
        ActivityResult.team_id == team_id,
        ActivityResult.is_completed.is_(True),
    )
    if activity_ids is not None:
        stmt = stmt.where(ActivityResult.activity_id.in_(activity_ids))
    return set((await db.scalars(stmt)).all())


async def _handle_complete_n_activities(
    db: AsyncSession, result: ActivityResult, defn: BadgeDefinition
) -> list[BadgeAward]:
    """Award once a team has completed at least ``count`` distinct activities.

    A milestone badge — many teams can earn it. Not scoped to any single
    activity/checkpoint.

    Criteria:
      - ``count`` (int, required, >= 1): how many completed activities to reach.
    """
    if not result.is_completed:
        return []

    criteria = defn.criteria or {}
    try:
        count = int(criteria.get("count", 0))
    except (TypeError, ValueError):
        return []
    if count < 1:
        return []

    completed = await _team_completed_activity_ids(db, result.team_id)
    if len(completed) < count:
        return []

    return [
        BadgeAward(
            team_id=result.team_id,
            badge_code=defn.code,
            meta={"count": len(completed)},
        )
    ]


async def _handle_complete_all_checkpoints(
    db: AsyncSession, result: ActivityResult, defn: BadgeDefinition
) -> list[BadgeAward]:
    """Award a team that has completed every active activity in the rally.

    "Finished the whole rally": the team has a completed result for every
    active activity across all checkpoints.

    Criteria (optional):
      - ``single_holder`` (bool, default False): only the first team to finish
        keeps the badge.
    """
    if not result.is_completed:
        return []

    criteria = defn.criteria or {}
    if criteria.get("single_holder") and await badge_service.badge_holder_exists(
        db, defn.code, None
    ):
        return []

    all_active = set(
        (await db.scalars(select(Activity.id).where(Activity.is_active.is_(True)))).all()
    )
    if not all_active:
        return []

    completed = await _team_completed_activity_ids(db, result.team_id, all_active)
    if not (all_active <= completed):
        return []

    return [
        BadgeAward(
            team_id=result.team_id,
            badge_code=defn.code,
            meta={"activities": len(all_active)},
        )
    ]


async def _handle_score_threshold(
    db: AsyncSession, result: ActivityResult, defn: BadgeDefinition
) -> list[BadgeAward]:
    """Award once a team's total score reaches ``min_score``.

    Total = sum of ``final_score`` over the team's completed results (the same
    quantity the leaderboard sums; kept as a pure read here so re-running is
    safe). A milestone badge — many teams can earn it.

    Criteria:
      - ``min_score`` (number, required): the total to reach.
    """
    if not result.is_completed:
        return []

    criteria = defn.criteria or {}
    if "min_score" not in criteria:
        return []
    try:
        min_score = float(criteria["min_score"])
    except (TypeError, ValueError):
        return []

    total = (
        await db.scalar(
            select(func.coalesce(func.sum(ActivityResult.final_score), 0.0)).where(
                ActivityResult.team_id == result.team_id,
                ActivityResult.is_completed.is_(True),
                ActivityResult.final_score.is_not(None),
            )
        )
    ) or 0.0
    if float(total) < min_score:
        return []

    return [
        BadgeAward(
            team_id=result.team_id,
            badge_code=defn.code,
            meta={"total_score": float(total)},
        )
    ]


async def _handle_fast_complete(
    db: AsyncSession, result: ActivityResult, defn: BadgeDefinition
) -> list[BadgeAward]:
    """Award a team that completed an activity within a time limit.

    Duration is measured from the result's creation to its completion
    (``completed_at - created_at``), since results carry no separate start
    time. Reacts to the triggering result only.

    Criteria:
      - ``max_seconds`` (number, required): the time budget.
      - ``activity_id`` (optional): restrict to one activity.
      - ``single_holder`` (bool, default False): only the first fast team keeps it.
    """
    if not result.is_completed or result.completed_at is None or result.created_at is None:
        return []

    criteria = defn.criteria or {}
    if "max_seconds" not in criteria:
        return []
    try:
        max_seconds = float(criteria["max_seconds"])
    except (TypeError, ValueError):
        return []

    scoped_activity = criteria.get("activity_id")
    if scoped_activity is not None and result.activity_id != scoped_activity:
        return []

    duration = (result.completed_at - result.created_at).total_seconds()
    if duration > max_seconds:
        return []

    if criteria.get("single_holder") and await badge_service.badge_holder_exists(
        db, defn.code, result.activity_id
    ):
        return []

    return [
        BadgeAward(
            team_id=result.team_id,
            badge_code=defn.code,
            activity_id=result.activity_id,
            meta={"duration_seconds": duration},
        )
    ]


# Registry mapping each trigger kind to its handler.
_TRIGGER_HANDLERS: dict[BadgeTrigger, Handler] = {
    BadgeTrigger.WIN_ACTIVITY: _handle_win_activity,
    BadgeTrigger.FIRST_COMPLETE_ACTIVITY: _handle_first_complete_activity,
    BadgeTrigger.FIRST_COMPLETE_CHECKPOINT: _handle_first_complete_checkpoint,
    BadgeTrigger.COMPLETE_N_ACTIVITIES: _handle_complete_n_activities,
    BadgeTrigger.COMPLETE_ALL_CHECKPOINTS: _handle_complete_all_checkpoints,
    BadgeTrigger.SCORE_THRESHOLD: _handle_score_threshold,
    BadgeTrigger.FAST_COMPLETE: _handle_fast_complete,
}


async def _load_auto_definitions(db: AsyncSession) -> list[BadgeDefinition]:
    """Active, auto badges that have a trigger. These are the rules to run."""
    stmt = select(BadgeDefinition).where(
        BadgeDefinition.is_active.is_(True),
        BadgeDefinition.is_auto.is_(True),
        BadgeDefinition.trigger_type.is_not(None),
    )
    return list((await db.scalars(stmt)).all())


async def evaluate_result(db: AsyncSession, result: ActivityResult) -> list[BadgeAward]:
    """Run every configured auto rule against a changed result, collect awards.

    A failing rule is logged and skipped so one bad definition never blocks the
    others.
    """
    awards: list[BadgeAward] = []
    for defn in await _load_auto_definitions(db):
        try:
            trigger = BadgeTrigger(defn.trigger_type)
        except ValueError:
            logger.warning(
                "Badge %s has unknown trigger_type %r; skipping",
                defn.code,
                defn.trigger_type,
            )
            continue
        handler = _TRIGGER_HANDLERS.get(trigger)
        if handler is None:
            continue
        try:
            awards.extend(await handler(db, result, defn))
        except Exception:  # noqa: BLE001 — one rule must not break the rest
            logger.exception("Badge rule %s (%s) failed", defn.code, trigger.value)
    return awards
