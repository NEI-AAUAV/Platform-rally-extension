"""Excel export of an event's results.

Produces a multi-sheet workbook mirroring the manual results spreadsheet:

- an **Overall** sheet: one row per team, one column per checkpoint (in visit
  order) holding that checkpoint's score, plus the team's total; and
- one **Checkpoint N** sheet per checkpoint, breaking each team's result down
  into match points, extra shots, penalties and notes.

The export is a plain read of persisted ``ActivityResult`` rows scoped to the
event; it never recomputes scores.
"""

from __future__ import annotations

from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.activity import Activity, ActivityResult
from app.models.checkpoint import CheckPoint
from app.models.team import Team

# Penalty keys as written by ScoringService.apply_vomit_penalty /
# apply_drink_penalty. Stored as accumulated positive magnitudes.
_VOMIT_KEY = "vomit"
_NOT_DRINKING_KEY = "not_drinking"

_HEADER_FILL = PatternFill(start_color="FF1F2937", end_color="FF1F2937", fill_type="solid")
_HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFFFF")
_BODY_FONT = Font(name="Arial")
_CENTER = Alignment(horizontal="center")


def _team_opponent_map(teams: list[Team]) -> dict[int, str]:
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


def _style_header(ws: Worksheet, ncols: int) -> None:
    for col in range(1, ncols + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = _CENTER


def _autosize(ws: Worksheet, ncols: int, min_width: int = 12) -> None:
    for col in range(1, ncols + 1):
        letter = get_column_letter(col)
        longest = max(
            (len(str(ws.cell(row=r, column=col).value or "")) for r in range(1, ws.max_row + 1)),
            default=min_width,
        )
        ws.column_dimensions[letter].width = max(min_width, longest + 2)


class ExportService:
    """Builds the results workbook for a single event."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _teams(self, event_id: int) -> list[Team]:
        stmt = (
            select(Team)
            .where(Team.event_id == event_id)
            .order_by(Team.name)
        )
        return list((await self.db.scalars(stmt)).all())

    async def _checkpoints(self, event_id: int) -> list[CheckPoint]:
        stmt = (
            select(CheckPoint)
            .where(CheckPoint.event_id == event_id)
            .order_by(CheckPoint.order)
        )
        return list((await self.db.scalars(stmt)).all())

    async def _results(self, event_id: int) -> list[ActivityResult]:
        """All results whose checkpoint belongs to this event."""
        stmt = (
            select(ActivityResult)
            .options(
                joinedload(ActivityResult.activity).joinedload(Activity.checkpoint)
            )
            .join(ActivityResult.activity)
            .join(Activity.checkpoint)
            .where(CheckPoint.event_id == event_id)
        )
        return list((await self.db.scalars(stmt)).all())

    @staticmethod
    def _penalty(result: ActivityResult, key: str) -> int:
        value = (result.penalties or {}).get(key, 0)
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _notes(result: ActivityResult) -> str:
        notes = (result.result_data or {}).get("notes")
        return str(notes) if notes else ""

    async def build_workbook(self, event_id: int) -> bytes:
        teams = await self._teams(event_id)
        checkpoints = await self._checkpoints(event_id)
        results = await self._results(event_id)

        opponent_of = _team_opponent_map(teams)
        team_name = {t.id: t.name for t in teams}

        # (team_id, checkpoint_id) -> summed final_score for the Overall sheet.
        cp_score: dict[tuple[int, int], float] = {}
        # (team_id, checkpoint_id) -> the result row for the per-checkpoint sheets.
        cp_result: dict[tuple[int, int], ActivityResult] = {}
        for r in results:
            cp = r.activity.checkpoint if r.activity else None
            if cp is None or r.team_id not in team_name:
                continue
            key = (r.team_id, cp.id)
            if r.is_completed and r.final_score is not None:
                cp_score[key] = cp_score.get(key, 0.0) + float(r.final_score)
            # Keep the last row seen per (team, checkpoint) for the detail sheets.
            cp_result[key] = r

        wb = Workbook()
        self._build_overall_sheet(
            wb, teams, checkpoints, opponent_of, cp_score
        )
        for idx, cp in enumerate(checkpoints, start=1):
            self._build_checkpoint_sheet(
                wb, cp, idx, teams, opponent_of, cp_result, cp_score
            )

        buffer = BytesIO()
        wb.save(buffer)
        return buffer.getvalue()

    def _build_overall_sheet(
        self,
        wb: Workbook,
        teams: list[Team],
        checkpoints: list[CheckPoint],
        opponent_of: dict[int, str],
        cp_score: dict[tuple[int, int], float],
    ) -> None:
        ws = wb.active
        ws.title = "Overall"

        headers = ["Team", "Versus Pair"] + [
            f"Checkpoint {i}" for i in range(1, len(checkpoints) + 1)
        ] + ["Total Points"]
        ws.append(headers)

        for team in teams:
            row: list[Any] = [team.name, opponent_of.get(team.id, "")]
            total = 0.0
            for cp in checkpoints:
                score = cp_score.get((team.id, cp.id), 0.0)
                total += score
                row.append(score)
            row.append(total)
            ws.append(row)

        self._finalize(ws, len(headers), body_center_from_col=3)

    def _build_checkpoint_sheet(
        self,
        wb: Workbook,
        checkpoint: CheckPoint,
        index: int,
        teams: list[Team],
        opponent_of: dict[int, str],
        cp_result: dict[tuple[int, int], ActivityResult],
        cp_score: dict[tuple[int, int], float],
    ) -> None:
        ws = wb.create_sheet(title=f"Checkpoint {index}")
        headers = [
            "Team",
            "Versus Pair",
            "Match Result",
            "Extra Shots",
            "Vomit penalty (-)",
            "Not drinking penalty (-)",
            "Notes",
            "Total Checkpoint",
        ]
        ws.append(headers)

        for team in teams:
            key = (team.id, checkpoint.id)
            result = cp_result.get(key)
            total = cp_score.get(key, 0.0)
            if result is None:
                # Team never recorded a result at this checkpoint.
                ws.append([team.name, opponent_of.get(team.id, ""), "", 0, 0, 0, "", total])
                continue
            ws.append([
                team.name,
                opponent_of.get(team.id, ""),
                total,  # Match Result mirrors the final checkpoint points.
                int(result.extra_shots or 0),
                self._penalty(result, _VOMIT_KEY),
                self._penalty(result, _NOT_DRINKING_KEY),
                self._notes(result),
                total,
            ])

        self._finalize(ws, len(headers), body_center_from_col=3, skip_center_cols={7})

    def _finalize(
        self,
        ws: Worksheet,
        ncols: int,
        *,
        body_center_from_col: int,
        skip_center_cols: set[int] | None = None,
    ) -> None:
        skip = skip_center_cols or set()
        _style_header(ws, ncols)
        for row in range(2, ws.max_row + 1):
            for col in range(1, ncols + 1):
                cell = ws.cell(row=row, column=col)
                cell.font = _BODY_FONT
                if col >= body_center_from_col and col not in skip:
                    cell.alignment = _CENTER
        ws.freeze_panes = "A2"
        _autosize(ws, ncols)
