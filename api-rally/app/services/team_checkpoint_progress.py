"""A team's state at each post, answered by checkpoint id.

``Team`` used to carry progress in parallel arrays whose index meant "route
position": ``times``, ``score_per_checkpoint`` and friends. Those drifted apart
(``times`` became a visit-order log while ``score_per_checkpoint`` stayed laid
out by route order) and made every route edit after the first check-in
dangerous. The facts themselves already live in identity-keyed tables —
``checkpoint_arrivals``, ``checkpoint_skips`` and ``activity_results`` — so this
module reads those and nothing positional.

:func:`build_checkpoint_progress` is pure, so the rules are unit-testable;
:func:`load_checkpoint_progress` does the three queries around it.
"""

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityResult
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_skip import CheckpointSkip
from app.schemas.team import CheckpointProgress, CheckpointProgressStatus
from app.services.route_progress import RouteSnapshot, is_checkpoint_resolved


def _scores_by_checkpoint(
    activities: Mapping[int, Sequence[Any]], results: Sequence[Any]
) -> tuple[dict[int, float], dict[int, datetime], frozenset[int]]:
    """Sum scored results per post, the latest completion time, scored ids."""
    checkpoint_by_activity = {act.id: cp_id for cp_id, acts in activities.items() for act in acts}
    scores: dict[int, float] = {}
    completed_at: dict[int, datetime] = {}
    scored_ids: set[int] = set()
    for result in results:
        if result.is_scored:
            scored_ids.add(result.activity_id)
        cp_id = checkpoint_by_activity.get(result.activity_id)
        if cp_id is None or not (result.is_completed and result.final_score is not None):
            continue
        scores[cp_id] = scores.get(cp_id, 0.0) + result.final_score
        if result.completed_at and (
            cp_id not in completed_at or result.completed_at > completed_at[cp_id]
        ):
            completed_at[cp_id] = result.completed_at
    return scores, completed_at, frozenset(scored_ids)


def build_checkpoint_progress(
    *,
    checkpoints: Sequence[Any],
    activities: Mapping[int, Sequence[Any]],
    arrivals: Mapping[int, datetime],
    skips: Mapping[int, int],
    results: Sequence[Any],
    hide_scores: bool = False,
) -> list[CheckpointProgress]:
    """One row per published post, sorted by current route order.

    ``arrivals`` maps checkpoint id → arrival time, ``skips`` checkpoint id →
    frozen skip cost. Status precedence: skipped, completed, arrived, pending —
    the same "resolved" rule as :mod:`app.services.route_progress`.
    """
    scores, completed_at, scored_ids = _scores_by_checkpoint(activities, results)
    arrived_ids = frozenset(arrivals)

    rows: list[CheckpointProgress] = []
    for cp in sorted(checkpoints, key=lambda c: c.order):
        arrived_at = arrivals.get(cp.id)
        cp_activities = activities.get(cp.id, [])
        status: CheckpointProgressStatus
        finished_at: datetime | None = None
        if cp.id in skips:
            status = "skipped"
        elif is_checkpoint_resolved(
            cp,
            activities=cp_activities,
            scored_activity_ids=scored_ids,
            arrived_ids=arrived_ids,
        ):
            status = "completed"
            finished_at = completed_at.get(cp.id, arrived_at)
        elif arrived_at is not None:
            status = "arrived"
        else:
            status = "pending"

        score = scores.get(cp.id)
        rows.append(
            CheckpointProgress(
                checkpoint_id=cp.id,
                checkpoint_order=cp.order,
                status=status,
                arrived_at=arrived_at,
                completed_at=finished_at,
                score=None if hide_scores or score is None else round(score),
                skip_cost=None if hide_scores else skips.get(cp.id),
            )
        )
    return rows


async def load_checkpoint_progress(
    db: AsyncSession,
    team_id: int,
    route: RouteSnapshot,
    *,
    hide_scores: bool = False,
) -> list[CheckpointProgress]:
    """Load the identity-keyed rows for one team and build its progress."""
    arrivals = dict(
        (
            await db.execute(
                select(CheckpointArrival.checkpoint_id, CheckpointArrival.arrived_at).where(
                    CheckpointArrival.team_id == team_id
                )
            )
        )
        .tuples()
        .all()
    )
    skips = dict(
        (
            await db.execute(
                select(CheckpointSkip.checkpoint_id, CheckpointSkip.cost).where(
                    CheckpointSkip.team_id == team_id
                )
            )
        )
        .tuples()
        .all()
    )
    results = (
        await db.scalars(select(ActivityResult).where(ActivityResult.team_id == team_id))
    ).all()
    return build_checkpoint_progress(
        checkpoints=route.checkpoints,
        activities=route.activities,
        arrivals=arrivals,
        skips=skips,
        results=results,
        hide_scores=hide_scores,
    )
