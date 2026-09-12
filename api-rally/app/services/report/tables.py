"""Table and text flowables shared by every report section.

Two rules the sections must not each rediscover:

- **Free text goes through `Paragraph`.** A bare string in a table cell does
  not wrap, so a staff briefing or an audit note silently overflows the column
  and runs off the page.
- **Column widths are shared out, never fixed.** The column count is decided
  by the event, so hard-coded widths overflow A4 as soon as an event uses more
  than a couple of counters.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import KeepTogether, Paragraph, Table, TableStyle

#: Usable width between the 2cm side margins of an A4 page.
CONTENT_WIDTH = 17 * cm

HEADER_BG = colors.HexColor("#1F2937")
ROW_ALT_BG = colors.HexColor("#F3F4F6")

_STYLES = getSampleStyleSheet()

#: Cell style for prose. 7.5pt matches the 8pt table font closely enough that
#: a wrapped cell does not look like a different table.
CELL_STYLE = ParagraphStyle(
    "ReportCell", parent=_STYLES["BodyText"], fontSize=7.5, leading=9, spaceAfter=0
)
BODY_STYLE = ParagraphStyle("ReportBody", parent=_STYLES["BodyText"], fontSize=9, leading=12)

#: Above this a cell is prose and gets wrapped rather than printed flat.
_WRAP_OVER = 40


def styles() -> Any:
    """The shared stylesheet, so sections don't each build their own."""
    return _STYLES


def text(value: Any) -> str:
    """One cell's value as display text."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m %H:%M")
    if isinstance(value, float):
        return f"{value:.0f}" if value == int(value) else f"{value:.1f}"
    return str(value)


def cell(value: Any) -> Any:
    """A cell that wraps when it holds prose and stays flat when it does not."""
    rendered = text(value)
    if len(rendered) > _WRAP_OVER:
        return Paragraph(_escape(rendered), CELL_STYLE)
    return rendered


def paragraph(value: Any, style: Any = None) -> Paragraph:
    return Paragraph(_escape(text(value)), style or BODY_STYLE)


def _escape(value: str) -> str:
    """reportlab parses cell text as mini-HTML, so markup has to be escaped."""
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def grid(rows: list[list[Any]], widths: list[float] | None = None) -> Table:
    """A header-plus-body table with the house style."""
    table = Table([[cell(v) for v in row] for row in rows], colWidths=widths)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]
    for index in range(2, len(rows), 2):
        style.append(("BACKGROUND", (0, index), (-1, index), ROW_ALT_BG))
    table.setStyle(TableStyle(style))
    return table


def facts(rows: list[list[Any]], label_width: float = 5 * cm) -> Table:
    """A two-column label/value table, for a record rather than a list."""
    table = Table(
        [[cell(label), cell(value)] for label, value in rows],
        colWidths=[label_width, CONTENT_WIDTH - label_width],
    )
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def weighted_widths(weights: list[float]) -> list[float]:
    """Share `CONTENT_WIDTH` out in proportion to the given weights."""
    total = sum(weights) or 1.0
    return [CONTENT_WIDTH * w / total for w in weights]


def keep(*flowables: Any) -> KeepTogether:
    """Keep a heading and its table on the same page."""
    return KeepTogether(list(flowables))
