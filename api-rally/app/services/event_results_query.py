"""Shared read/aggregation layer for an event's results.

Both the Excel export (`export_service.py`) and the PDF report
(`pdf_report_service.py`) need the same three DB reads and the same
per-(team, checkpoint) score aggregation — extracted here so the two
document builders can't drift out of sync on what counts as a team's score
at a checkpoint. Pure reads: never recomputes or writes scores.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.activity import Activity, ActivityResult
from app.models.checkpoint import CheckPoint
from app.models.team import Team


def team_opponent_map(teams: list[Team]) -> dict[int, str]:
    """Map team_id -> opponent name via versus_group_id pairing.

    Two teams sharing a non-null ``versus_group_id`` are opponents. Teams with
    no group (or an unpaired group) map to an empty string.
    """
    by_group: dict[int, list[Team]] = {}
    for team in teams:
        if team.versus_group_id is not None:
            by_group.setdefault(team.versus_group_id, []).append(team)

    opponent: dict[int, str] = {t.id: "" for t in teams}
    for group in by_group.values():
        if len(group) == 2:
            a, b = group
            opponent[a.id] = b.name
            opponent[b.id] = a.name
    return opponent


def result_penalty(result: ActivityResult, key: str) -> int:
    value = (result.penalties or {}).get(key, 0)
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def result_notes(result: ActivityResult) -> str:
    notes = (result.result_data or {}).get("notes")
    return str(notes) if notes else ""


@dataclass
class EventResultsData:
    """Everything a results document (Excel sheet, PDF report, ...) needs,
    read once and shared between however many sections/sheets it builds."""

    teams: list[Team]
    checkpoints: list[CheckPoint]
    results: list[ActivityResult]
    opponent_of: dict[int, str] = field(init=False)
    # (team_id, checkpoint_id) -> summed final_score.
    cp_score: dict[tuple[int, int], float] = field(init=False)
    # (team_id, checkpoint_id) -> the last result row seen, for per-checkpoint detail.
    cp_result: dict[tuple[int, int], ActivityResult] = field(init=False)

    def __post_init__(self) -> None:
        self.opponent_of = team_opponent_map(self.teams)
        team_ids = {t.id for t in self.teams}

        cp_score: dict[tuple[int, int], float] = {}
        cp_result: dict[tuple[int, int], ActivityResult] = {}
        for r in self.results:
            cp = r.activity.checkpoint if r.activity else None
            if cp is None or r.team_id not in team_ids:
                continue
            key = (r.team_id, cp.id)
            if r.is_completed and r.final_score is not None:
                cp_score[key] = cp_score.get(key, 0.0) + float(r.final_score)
            cp_result[key] = r
        self.cp_score = cp_score
        self.cp_result = cp_result

    def team_total(self, team_id: int) -> float:
        return sum(score for (tid, _cp_id), score in self.cp_score.items() if tid == team_id)


class EventResultsQuery:
    """Read-only DB access for one event's teams/checkpoints/results."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def teams(self, event_id: int) -> list[Team]:
        stmt = select(Team).where(Team.event_id == event_id).order_by(Team.name)
        return list((await self.db.scalars(stmt)).all())

    async def checkpoints(self, event_id: int) -> list[CheckPoint]:
        stmt = select(CheckPoint).where(CheckPoint.event_id == event_id).order_by(CheckPoint.order)
        return list((await self.db.scalars(stmt)).all())

    async def results(self, event_id: int) -> list[ActivityResult]:
        """All results whose checkpoint belongs to this event."""
        stmt = (
            select(ActivityResult)
            .options(joinedload(ActivityResult.activity).joinedload(Activity.checkpoint))
            .join(ActivityResult.activity)
            .join(Activity.checkpoint)
            .where(CheckPoint.event_id == event_id)
        )
        return list((await self.db.scalars(stmt)).all())

    async def load(self, event_id: int) -> EventResultsData:
        teams = await self.teams(event_id)
        checkpoints = await self.checkpoints(event_id)
        results = await self.results(event_id)
        return EventResultsData(teams=teams, checkpoints=checkpoints, results=results)
