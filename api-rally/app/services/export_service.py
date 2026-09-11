"""Excel export of an event's results.

Produces a multi-sheet workbook mirroring the manual results spreadsheet:

- an **Overall** sheet: one row per team, one column per checkpoint the event
  actually used, holding that checkpoint's score, plus the team's total;
- one sheet per used checkpoint, breaking each team's result down into the
  columns that event genuinely recorded (see `event_report_columns`); and
- a sheet per side mechanic — hints, skips, manual awards, badges — each
  present only when that mechanic featured in the event.

The export is a plain read of persisted rows scoped to the event; it never
recomputes scores.
"""

from __future__ import annotations

import re
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.event_report_columns import (
    ABSENT_XLSX,
    ReportColumn,
    checkpoint_columns,
    checkpoint_row,
)
from app.services.event_results_query import EventResultsData, EventResultsQuery

_HEADER_FILL = PatternFill(start_color="FF1F2937", end_color="FF1F2937", fill_type="solid")
_HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFFFF")
_BODY_FONT = Font(name="Arial")
_CENTER = Alignment(horizontal="center")

#: Excel caps a sheet title at 31 characters and rejects []:*?/\ outright.
_MAX_SHEET_TITLE = 31
_ILLEGAL_SHEET_CHARS = re.compile(r"[\[\]:*?/\\]")


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


def _sheet_title(index: int, name: str, taken: set[str]) -> str:
    """`"3. Bar do Zé"`, trimmed to what Excel accepts and kept unique."""
    prefix = f"{index}. "
    clean = _ILLEGAL_SHEET_CHARS.sub(" ", name or "").strip()
    title = (prefix + clean).strip()[:_MAX_SHEET_TITLE] or prefix.strip()
    if title in taken:
        suffix = f" ({len(taken)})"
        title = title[: _MAX_SHEET_TITLE - len(suffix)] + suffix
    taken.add(title)
    return title


class ExportService:
    """Builds the results workbook for a single event."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._query = EventResultsQuery(db)

    async def build_workbook(self, event_id: int) -> bytes:
        data = await self._query.load(event_id)

        wb = Workbook()
        self._build_overall_sheet(wb, data)

        taken: set[str] = set()
        columns = checkpoint_columns(data)
        for index, checkpoint in enumerate(data.checkpoints, start=1):
            # A checkpoint no team reached contributes nothing but a sheet of
            # blanks, so it does not get one.
            if not data.checkpoint_used(checkpoint.id):
                continue
            self._build_checkpoint_sheet(
                wb, data, checkpoint, columns, _sheet_title(index, checkpoint.name, taken)
            )

        self._build_hints_sheet(wb, data)
        self._build_skips_sheet(wb, data)
        self._build_awards_sheet(wb, data)
        self._build_badges_sheet(wb, data)

        buffer = BytesIO()
        wb.save(buffer)
        return buffer.getvalue()

    # ---------- overall ----------

    def _build_overall_sheet(self, wb: Workbook, data: EventResultsData) -> None:
        ws = wb.active
        ws.title = "Overall"

        checkpoints = data.used_checkpoints()
        show_versus = data.has_versus
        headers = ["Team"]
        if show_versus:
            headers.append("Versus Pair")
        headers += [f"{i}. {cp.name}" for i, cp in enumerate(checkpoints, start=1)]
        headers.append("Total Points")
        ws.append(headers)

        for team in data.teams:
            row: list[Any] = [team.name]
            if show_versus:
                row.append(data.opponent_of.get(team.id, ""))
            for cp in checkpoints:
                row.append(
                    data.cp_score.get((team.id, cp.id), 0.0)
                    if data.team_attended(team.id, cp.id)
                    else ABSENT_XLSX
                )
            row.append(data.team_total(team.id))
            ws.append(row)

        self._finalize(ws, len(headers), body_center_from_col=2 + int(show_versus))

    # ---------- per-checkpoint ----------

    def _build_checkpoint_sheet(
        self,
        wb: Workbook,
        data: EventResultsData,
        checkpoint: Any,
        columns: list[ReportColumn],
        title: str,
    ) -> None:
        ws = wb.create_sheet(title=title)
        ws.append([c.header_en for c in columns])

        for team in data.teams:
            ws.append(checkpoint_row(data, columns, team, checkpoint, absent=ABSENT_XLSX))

        text_cols = {i for i, c in enumerate(columns, start=1) if not c.numeric}
        self._finalize(ws, len(columns), body_center_from_col=2, skip_center_cols=text_cols)

    # ---------- side mechanics ----------

    def _build_hints_sheet(self, wb: Workbook, data: EventResultsData) -> None:
        if not data.has_hints:
            return
        ws = wb.create_sheet(title="Hints")
        headers = ["Team", "Checkpoint", "Revealed At", "Cost"]
        ws.append(headers)
        for reveal in data.hint_reveals:
            ws.append(
                [
                    data.team_name(reveal.team_id),
                    data.checkpoint_name(reveal.checkpoint_id),
                    _naive(reveal.revealed_at),
                    int(reveal.cost or 0),
                ]
            )
        self._finalize(ws, len(headers), body_center_from_col=3)

    def _build_skips_sheet(self, wb: Workbook, data: EventResultsData) -> None:
        if not data.has_skips:
            return
        ws = wb.create_sheet(title="Skips")
        headers = ["Team", "Checkpoint", "Skipped At", "Cost"]
        ws.append(headers)
        for skip in data.skips:
            ws.append(
                [
                    data.team_name(skip.team_id),
                    data.checkpoint_name(skip.checkpoint_id),
                    _naive(skip.skipped_at),
                    int(skip.cost or 0),
                ]
            )
        self._finalize(ws, len(headers), body_center_from_col=3)

    def _build_awards_sheet(self, wb: Workbook, data: EventResultsData) -> None:
        awards = data.manual_awards()
        if not awards:
            return
        ws = wb.create_sheet(title="Manual Awards")
        headers = ["Team", "Points", "Reason", "Awarded At"]
        ws.append(headers)
        for award in awards:
            ws.append(
                [
                    data.team_name(award.team_id),
                    float(award.points or 0),
                    award.reason or "",
                    _naive(award.awarded_at),
                ]
            )
        self._finalize(ws, len(headers), body_center_from_col=2, skip_center_cols={3})

    def _build_badges_sheet(self, wb: Workbook, data: EventResultsData) -> None:
        if not data.has_badges:
            return
        ws = wb.create_sheet(title="Badges")
        headers = ["Team", "Badge", "Checkpoint", "Awarded At"]
        ws.append(headers)
        for badge in data.badges:
            ws.append(
                [
                    data.team_name(badge.team_id),
                    str(badge.badge_type),
                    (
                        data.checkpoint_name(badge.checkpoint_id)
                        if badge.checkpoint_id is not None
                        else ""
                    ),
                    _naive(badge.awarded_at),
                ]
            )
        self._finalize(ws, len(headers), body_center_from_col=2)

    # ---------- shared styling ----------

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


def _naive(value: Any) -> Any:
    """Drop the tzinfo openpyxl refuses to write.

    Every timestamp in these tables is TIMESTAMPTZ, and openpyxl raises on a
    timezone-aware datetime rather than converting it.
    """
    tzinfo = getattr(value, "tzinfo", None)
    return value.replace(tzinfo=None) if tzinfo is not None else value
