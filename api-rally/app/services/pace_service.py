"""Derived pace ranking; deliberately separate from scoring.

Race time runs from a team's first checkpoint arrival to its last progress
event, so waiting around before post 1 costs nothing.
"""

import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.crud._event_scope import current_event_id
from app.crud.crud_team import team as team_crud
from app.models.activity import ActivityResult
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_skip import CheckpointSkip
from app.services.route_progress import load_route_snapshot, progress_for_teams


@dataclass(frozen=True)
class TeamPace:
    team_id: int
    # First checkpoint arrival; None when the team has none on record.
    started_at: datetime | None
    last_progress_at: datetime | None
    elapsed_seconds: float | None
    resolved_count: int
    total_published: int
    is_finished: bool
    rank: int


def _aware(value: datetime | None) -> datetime | None:
    return value if value is None or value.tzinfo is not None else value.replace(tzinfo=UTC)


def team_start_time(first_arrived_at: datetime | None) -> datetime | None:
    """The team's clock starts at its first checkpoint arrival.

    Deliberately not the event's scheduled start: a team that reaches post 1
    late was not racing during that wait, so charging it that time would rank
    it behind teams whose only advantage was starting on time. For the same
    reason ``start_offset_minutes`` (staggered start) does not shift this — it
    only gates check-in, via ``team_service.validate_rally_timing``.

    A team with no arrival on record has no start, hence no elapsed time.
    """
    return _aware(first_arrived_at)


async def _timestamp_maps(
    db: AsyncSession, team_ids: list[int]
) -> tuple[dict[int, datetime], dict[int, datetime], dict[int, datetime], dict[int, datetime]]:
    if not team_ids:
        return {}, {}, {}, {}
    arrivals = await db.execute(
        select(
            CheckpointArrival.team_id,
            func.min(CheckpointArrival.arrived_at),
            func.max(CheckpointArrival.arrived_at),
        )
        .where(CheckpointArrival.team_id.in_(team_ids))
        .group_by(CheckpointArrival.team_id)
    )
    # When the team stopped working at the post. That is ``completed_at`` — the
    # moment staff submitted the evaluation — except for deferred judging,
    # where ``completed_at`` is when the panel got round to watching the media,
    # hours after the team left. Its ``created_at`` is the capture at the post,
    # which is the moment the team was actually done.
    finished_work_at = case(
        (ActivityResult.judgment_status.is_not(None), ActivityResult.created_at),
        else_=ActivityResult.completed_at,
    )
    results = await db.execute(
        select(ActivityResult.team_id, func.max(finished_work_at))
        .where(ActivityResult.team_id.in_(team_ids), ActivityResult.final_score.is_not(None))
        .group_by(ActivityResult.team_id)
    )
    skips = await db.execute(
        select(CheckpointSkip.team_id, func.max(CheckpointSkip.skipped_at))
        .where(CheckpointSkip.team_id.in_(team_ids))
        .group_by(CheckpointSkip.team_id)
    )
    first_arrivals: dict[int, datetime] = {}
    last_arrivals: dict[int, datetime] = {}
    for team_id, first, last in arrivals:
        if first is not None:
            first_arrivals[team_id] = _aware(first)  # type: ignore[assignment]
        if last is not None:
            last_arrivals[team_id] = _aware(last)  # type: ignore[assignment]
    completion_times: dict[int, datetime] = {}
    for team_id, value in results:
        if value is not None:
            completion_times[team_id] = (
                value if value.tzinfo is not None else value.replace(tzinfo=UTC)
            )
    skip_times: dict[int, datetime] = {}
    for team_id, value in skips:
        if value is not None:
            skip_times[team_id] = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return (
        first_arrivals,
        last_arrivals,
        completion_times,
        skip_times,
    )


# event id -> (monotonic deadline, ranked paces). Per worker process, so a write
# handled by another worker shows up here at most PACE_CACHE_TTL_SECONDS late.
_pace_cache: dict[int | None, tuple[float, list[TeamPace]]] = {}


async def compute_paces(db: AsyncSession, settings: Any) -> list[TeamPace]:
    """Derived pace for all teams, reused for a couple of seconds.

    The first caller after the deadline claims the refresh by pushing the
    deadline out before it recomputes, so concurrent callers keep being served
    the previous ranking instead of all recomputing it at once.
    """
    ttl = app_settings.PACE_CACHE_TTL_SECONDS
    if ttl <= 0:
        return await _load_paces(db, settings)
    key = await current_event_id(db)
    now = time.monotonic()
    cached = _pace_cache.get(key)
    if cached is not None and now < cached[0]:
        return list(cached[1])
    if cached is not None:
        _pace_cache[key] = (now + ttl, cached[1])
    try:
        paces = await _load_paces(db, settings)
    except Exception:
        _pace_cache.pop(key, None)
        raise
    _pace_cache[key] = (time.monotonic() + ttl, paces)
    return list(paces)


async def _load_paces(db: AsyncSession, settings: Any) -> list[TeamPace]:
    """Load all teams' derived pace with batched timestamp queries."""
    teams = list(await team_crud.get_multi(db))
    ids = [team.id for team in teams]
    first_arrivals, last_arrivals, completions, skips = await _timestamp_maps(db, ids)
    route = await load_route_snapshot(db, settings)
    progresses = await progress_for_teams(db, teams, settings, route=route)
    candidates: list[TeamPace] = []
    for team in teams:
        progress = progresses[team.id]
        started_at = team_start_time(first_arrivals.get(team.id))
        stamps = (last_arrivals.get(team.id), completions.get(team.id), skips.get(team.id))
        last_progress_at = max((stamp for stamp in stamps if stamp is not None), default=None)
        elapsed = (
            (last_progress_at - started_at).total_seconds()
            if started_at is not None and last_progress_at is not None
            else None
        )
        candidates.append(
            TeamPace(
                team_id=team.id,
                started_at=started_at,
                last_progress_at=last_progress_at,
                elapsed_seconds=elapsed if elapsed is None or elapsed >= 0 else None,
                resolved_count=len(progress.resolved_orders),
                total_published=progress.total_published,
                is_finished=progress.is_finished,
                rank=0,
            )
        )
    return rank_paces(candidates)


def rank_paces(candidates: list[TeamPace]) -> list[TeamPace]:
    """Order derived pace independently of scoring's team classification."""
    candidates.sort(
        key=lambda pace: (
            -pace.resolved_count,
            pace.elapsed_seconds if pace.elapsed_seconds is not None else float("inf"),
            pace.team_id,
        )
    )
    ranked: list[TeamPace] = []
    rank = 0
    for pace in candidates:
        if pace.resolved_count:
            rank += 1
        ranked.append(TeamPace(**{**pace.__dict__, "rank": rank if pace.resolved_count else 0}))
    return ranked
