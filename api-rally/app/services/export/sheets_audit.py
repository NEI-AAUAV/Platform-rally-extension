"""Trail sheets: score edits, admin actions, and the side mechanics.

The two audit trails are deliberately separate tables and stay separate here:
`EvaluationHistory` is the only record of a score being changed, while
`AuditLog` covers the administrative actions around it. Conflating them would
imply a completeness neither has on its own.
"""

from __future__ import annotations

import json
from typing import Any

from openpyxl import Workbook

from app.services.event_report_context import EventReportContext, change_rows
from app.services.export.styles import add_sheet

#: Cells hold a rendered value, not a JSON blob, unless the value is itself
#: structured — a changed `penalties` dict has no shorter honest rendering.
_MAX_RENDERED = 300


def build_evaluation_log_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    """One row per changed field, so a diff is readable without parsing JSON."""
    if not ctx.audit.has_evaluations:
        return

    data = ctx.results
    headers = [
        "When",
        "Action",
        "Editor",
        "Editor ID",
        "Team",
        "Checkpoint",
        "Activity",
        "Field",
        "Before",
        "After",
        "Note",
    ]

    rows: list[list[Any]] = []
    for history in ctx.audit.evaluations:
        result = ctx.audit.result_of(history)
        activity = getattr(result, "activity", None) if result else None
        checkpoint = getattr(activity, "checkpoint", None) if activity else None
        base = [
            history.created_at,
            history.action,
            history.editor_name or "",
            history.editor_id or "",
            data.team_name(result.team_id) if result else "",
            data.checkpoint_name(checkpoint.id) if checkpoint else "",
            getattr(activity, "name", "") if activity else "",
        ]
        changed = change_rows(history.changes)
        if not changed:
            # A contest changes no scoring field; its substance is the note.
            rows.append([*base, "", "", "", history.note or ""])
            continue
        for field_name, before, after in changed:
            rows.append([*base, field_name, _render(before), _render(after), history.note or ""])

    add_sheet(wb, "Evaluation Log", headers, rows, center_from=2, text_cols={9, 10, 11})


def build_audit_log_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    """Administrative actions recorded against this event."""
    if not ctx.audit.has_audit_log:
        return

    headers = [
        "When",
        "Actor",
        "Actor ID",
        "Actor Kind",
        "Action",
        "Target Type",
        "Target ID",
        "Field",
        "Before",
        "After",
        "Note",
        "Request ID",
    ]

    rows: list[list[Any]] = []
    for entry in ctx.audit.audit_log:
        base = [
            entry.created_at,
            entry.actor_name or "",
            entry.actor_id or "",
            entry.actor_kind,
            entry.action,
            entry.target_type,
            entry.target_id or "",
        ]
        changed = change_rows(entry.changes)
        if not changed:
            rows.append([*base, "", "", "", entry.note or "", entry.request_id or ""])
            continue
        for field_name, before, after in changed:
            rows.append(
                [
                    *base,
                    field_name,
                    _render(before),
                    _render(after),
                    entry.note or "",
                    entry.request_id or "",
                ]
            )

    add_sheet(wb, "Audit Log", headers, rows, center_from=2, text_cols={9, 10, 11})


def build_hints_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    if not ctx.results.has_hints:
        return
    data = ctx.results
    rows = [
        [
            data.team_name(r.team_id),
            data.checkpoint_name(r.checkpoint_id),
            r.revealed_at,
            int(r.cost or 0),
        ]
        for r in data.hint_reveals
    ]
    add_sheet(wb, "Hints", ["Team", "Checkpoint", "Revealed At", "Cost"], rows, center_from=3)


def build_skips_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    if not ctx.results.has_skips:
        return
    data = ctx.results
    rows = [
        [
            data.team_name(s.team_id),
            data.checkpoint_name(s.checkpoint_id),
            s.skipped_at,
            int(s.cost or 0),
        ]
        for s in data.skips
    ]
    add_sheet(wb, "Skips", ["Team", "Checkpoint", "Skipped At", "Cost"], rows, center_from=3)


def build_awards_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    """Admin one-offs only; the automatic overflow carries belong to their result."""
    awards = ctx.results.manual_awards()
    if not awards:
        return
    rows = [
        [
            ctx.results.team_name(a.team_id),
            float(a.points or 0),
            a.reason or "",
            a.awarded_at,
        ]
        for a in awards
    ]
    add_sheet(
        wb,
        "Manual Awards",
        ["Team", "Points", "Reason", "Awarded At"],
        rows,
        center_from=2,
        text_cols={3},
    )


def build_badges_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    if not ctx.results.has_badges:
        return
    data = ctx.results
    rows = [
        [
            data.team_name(b.team_id),
            str(b.badge_type),
            data.checkpoint_name(b.checkpoint_id) if b.checkpoint_id is not None else "",
            b.awarded_at,
        ]
        for b in data.badges
    ]
    add_sheet(wb, "Badges", ["Team", "Badge", "Checkpoint", "Awarded At"], rows, center_from=2)


def _render(value: Any) -> str:
    """A diff side as text.

    `result_data`, `penalties` and `bonuses` are themselves JSON, so their
    before/after are nested structures rather than scalars.
    """
    if value is None:
        return ""
    if isinstance(value, str | int | float | bool):
        return str(value)
    try:
        rendered = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
    except (TypeError, ValueError):
        rendered = str(value)
    return rendered if len(rendered) <= _MAX_RENDERED else rendered[: _MAX_RENDERED - 1] + "…"
