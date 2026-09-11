"""Shared workbook styling and the one way a sheet gets written.

Every sheet in the dossier is a header row plus body rows, so they all go
through `add_sheet` rather than each family re-deriving freeze panes, column
widths and which columns to centre.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from datetime import datetime
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

HEADER_FILL = PatternFill(start_color="FF1F2937", end_color="FF1F2937", fill_type="solid")
HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFFFF")
BODY_FONT = Font(name="Arial")
TOTAL_FONT = Font(name="Arial", bold=True)
CENTER = Alignment(horizontal="center")
WRAP = Alignment(vertical="top", wrap_text=True)

#: Excel caps a sheet title at 31 characters and rejects []:*?/\ outright.
MAX_SHEET_TITLE = 31
_ILLEGAL_SHEET_CHARS = re.compile(r"[\[\]:*?/\\]")

#: Beyond this a cell is free text, not a value: wrap it and give the column
#: a fixed generous width instead of sizing to the longest line.
_WRAP_WIDTH = 60
_MAX_AUTO_WIDTH = 60


def sheet_title(name: str, taken: set[str], *, prefix: str = "") -> str:
    """A title Excel accepts, unique within the workbook.

    Callers must use the returned title verbatim in any formula that
    references the sheet — sanitising and truncating means a title cannot be
    reconstructed from the original name.
    """
    clean = _ILLEGAL_SHEET_CHARS.sub(" ", name or "").strip()
    title = (prefix + clean).strip()[:MAX_SHEET_TITLE] or (prefix.strip() or "Sheet")
    if title in taken:
        suffix = f" ({len(taken)})"
        title = title[: MAX_SHEET_TITLE - len(suffix)] + suffix
    taken.add(title)
    return title


def naive(value: Any) -> Any:
    """Drop the tzinfo openpyxl refuses to write.

    Every timestamp in these tables is TIMESTAMPTZ, and openpyxl raises on a
    timezone-aware datetime rather than converting it.
    """
    tzinfo = getattr(value, "tzinfo", None)
    return value.replace(tzinfo=None) if tzinfo is not None else value


def cell_value(value: Any) -> Any:
    """Coerce anything a model holds into something a cell can store.

    Lists (``User.scopes``, ``media_urls``) and dicts (``Activity.config``)
    would otherwise raise; a readable rendering beats a failed export.
    """
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, datetime):
        return naive(value)
    if isinstance(value, list | tuple):
        return ", ".join(str(v) for v in value)
    if isinstance(value, dict):
        return ", ".join(f"{k}={v}" for k, v in value.items())
    return str(value)


def add_sheet(
    wb: Workbook,
    title: str,
    headers: Sequence[str],
    rows: Iterable[Sequence[Any]],
    *,
    center_from: int = 2,
    text_cols: Iterable[int] = (),
    total_row: Sequence[Any] | None = None,
) -> Worksheet:
    """Write one styled sheet.

    ``center_from`` is the 1-based first column to centre; ``text_cols`` are
    1-based columns exempt from centring because they hold prose.
    """
    ws = wb.create_sheet(title=title) if wb.sheetnames != ["Sheet"] else wb.active
    if ws.title != title:
        ws.title = title

    ws.append(list(headers))
    for row in rows:
        ws.append([cell_value(v) for v in row])
    if total_row is not None:
        ws.append(list(total_row))

    _finalize(
        ws,
        len(headers),
        center_from=center_from,
        text_cols=set(text_cols),
        has_total=total_row is not None,
    )
    return ws


def _finalize(
    ws: Worksheet,
    ncols: int,
    *,
    center_from: int,
    text_cols: set[int],
    has_total: bool,
) -> None:
    for col in range(1, ncols + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER

    last_row = ws.max_row
    for row in range(2, last_row + 1):
        is_total = has_total and row == last_row
        for col in range(1, ncols + 1):
            cell = ws.cell(row=row, column=col)
            cell.font = TOTAL_FONT if is_total else BODY_FONT
            if col in text_cols:
                cell.alignment = WRAP
            elif col >= center_from:
                cell.alignment = CENTER

    ws.freeze_panes = "A2"
    _autosize(ws, ncols, text_cols)


def _autosize(ws: Worksheet, ncols: int, text_cols: set[int], min_width: int = 12) -> None:
    for col in range(1, ncols + 1):
        letter = get_column_letter(col)
        if col in text_cols:
            ws.column_dimensions[letter].width = _WRAP_WIDTH
            continue
        longest = max(
            (len(str(ws.cell(row=r, column=col).value or "")) for r in range(1, ws.max_row + 1)),
            default=min_width,
        )
        ws.column_dimensions[letter].width = min(_MAX_AUTO_WIDTH, max(min_width, longest + 2))
