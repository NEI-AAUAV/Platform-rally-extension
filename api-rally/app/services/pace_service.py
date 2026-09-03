"""Derived, event-relative pace ranking; deliberately separate from scoring."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.crud_team import team as team_crud
from app.models.activity import ActivityResult, RallyEvent
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_skip import CheckpointSkip
from app.models.team import Team
from app.services.route_progress import load_route_snapshot, progress_for_team


@dataclass(frozen=True)
class TeamPace:
    team_id: int
    started_at: datetime | None
    last_progress_at: datetime | None
    elapsed_seconds: float | None
    resolved_count: int
    total_published: int
    is_finished: bool
    rank: int


def _aware(value: datetime | None) -> datetime | None:
    return value if value is None or value.tzinfo is not None else value.replace(tzinfo=UTC)


def team_start_time(
    team: Team,
    event: RallyEvent | None,
    settings: Any,
    first_arrived_at: datetime | None = None,
) -> datetime | None:
    """The team's scheduled start, with legacy-safe timing fallbacks."""
    start = _aware(getattr(event, "start_time", None)) or _aware(
        getattr(settings, "rally_start_time", None)
    )
    start = start or _aware(first_arrived_at)
    if start is None:
        return None
    return start + timedelta(minutes=getattr(team, "start_offset_minutes", 0) or 0)


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
    results = await db.execute(
        select(ActivityResult.team_id, func.max(ActivityResult.completed_at))
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


async def compute_paces(db: AsyncSession, settings: Any) -> list[TeamPace]:
    """Load all teams' derived pace with batched timestamp queries."""
    teams = list(await team_crud.get_multi(db))
    event = await team_crud.get_current_event(db)
    ids = [team.id for team in teams]
    first_arrivals, last_arrivals, completions, skips = await _timestamp_maps(db, ids)
    route = await load_route_snapshot(db, settings)
    candidates: list[TeamPace] = []
    for team in teams:
        progress = await progress_for_team(db, team, settings, route=route)
        started_at = team_start_time(team, event, settings, first_arrivals.get(team.id))
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
