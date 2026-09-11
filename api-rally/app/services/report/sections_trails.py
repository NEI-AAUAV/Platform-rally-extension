"""Trail sections: side mechanics, manual adjustments, badges, and both logs."""

from __future__ import annotations

import json
from typing import Any

from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer

from app.services.event_report_context import EventReportContext, change_rows
from app.services.report.tables import grid, styles, text, weighted_widths

#: A diff side is summarised past this; the full value is in the workbook.
_MAX_RENDERED = 120


def hints_and_skips(ctx: EventReportContext) -> list[object]:
    data = ctx.results
    if not (data.has_hints or data.has_skips):
        return []

    story: list[object] = [Paragraph("Pistas e Desistências", styles()["Heading1"])]

    if data.has_hints:
        rows: list[list[Any]] = [["Equipa", "Posto", "Quando", "Custo"]]
        for reveal in data.hint_reveals:
            rows.append(
                [
                    data.team_name(reveal.team_id),
                    data.checkpoint_name(reveal.checkpoint_id),
                    reveal.revealed_at,
                    int(reveal.cost or 0),
                ]
            )
        story.append(Paragraph("Pistas reveladas", styles()["Heading2"]))
        story.append(grid(rows, weighted_widths([2.5, 2.5, 2, 1])))
        story.append(Spacer(1, 0.5 * cm))

    if data.has_skips:
        rows = [["Equipa", "Posto", "Quando", "Custo"]]
        for skip in data.skips:
            rows.append(
                [
                    data.team_name(skip.team_id),
                    data.checkpoint_name(skip.checkpoint_id),
                    skip.skipped_at,
                    int(skip.cost or 0),
                ]
            )
        story.append(Paragraph("Postos desistidos", styles()["Heading2"]))
        story.append(grid(rows, weighted_widths([2.5, 2.5, 2, 1])))
    return story


def manual_awards(ctx: EventReportContext) -> list[object]:
    """Admin one-offs only.

    An award carrying an `activity_result_id` is the automatic penalty
    overflow for that result, already counted in its checkpoint's columns;
    repeating it here would double it to the reader.
    """
    awards = ctx.results.manual_awards()
    if not awards:
        return []

    rows: list[list[Any]] = [["Equipa", "Pontos", "Motivo", "Quando"]]
    for award in awards:
        rows.append(
            [
                ctx.results.team_name(award.team_id),
                f"{float(award.points or 0):+.0f}",
                award.reason or "—",
                award.awarded_at,
            ]
        )
    return [
        Paragraph("Ajustes Manuais", styles()["Heading1"]),
        grid(rows, weighted_widths([2.5, 1, 4, 2])),
    ]


def badges(ctx: EventReportContext) -> list[object]:
    data = ctx.results
    if not data.has_badges:
        return []

    rows: list[list[Any]] = [["Equipa", "Medalha", "Posto", "Quando"]]
    for badge in data.badges:
        rows.append(
            [
                data.team_name(badge.team_id),
                str(badge.badge_type).replace("_", " ").capitalize(),
                data.checkpoint_name(badge.checkpoint_id) if badge.checkpoint_id else "—",
                badge.awarded_at,
            ]
        )
    return [
        Paragraph("Medalhas", styles()["Heading1"]),
        grid(rows, weighted_widths([2.5, 3, 2, 2])),
    ]


def evaluation_log(ctx: EventReportContext) -> list[object]:
    """Every score edit and team contest, one row per changed field."""
    if not ctx.audit.has_evaluations:
        return []

    data = ctx.results
    rows: list[list[Any]] = [
        ["Quando", "Ação", "Autor", "Equipa", "Posto", "Campo", "Antes", "Depois", "Nota"]
    ]
    for history in ctx.audit.evaluations:
        result = ctx.audit.result_of(history)
        activity = getattr(result, "activity", None) if result else None
        checkpoint = getattr(activity, "checkpoint", None) if activity else None
        base = [
            history.created_at,
            "alteração" if history.action == "updated" else "contestação",
            history.editor_name or "—",
            data.team_name(result.team_id) if result else "—",
            data.checkpoint_name(getattr(checkpoint, "id", -1)) if checkpoint else "—",
        ]
        changed = change_rows(history.changes)
        if not changed:
            # A contest changes no scoring field; its substance is the note.
            rows.append([*base, "—", "—", "—", history.note or "—"])
            continue
        for field_name, before, after in changed:
            rows.append([*base, field_name, _render(before), _render(after), history.note or "—"])

    return [
        Paragraph("Registo de Avaliações", styles()["Heading1"]),
        grid(rows, weighted_widths([1.3, 1.2, 1.6, 1.6, 1.6, 1.4, 1.6, 1.6, 1.6])),
    ]


def audit_log(ctx: EventReportContext) -> list[object]:
    """Administrative actions. Score edits are not here — they have their own log."""
    if not ctx.audit.has_audit_log:
        return []

    rows: list[list[Any]] = [
        ["Quando", "Autor", "Tipo", "Ação", "Alvo", "Campo", "Antes", "Depois"]
    ]
    for entry in ctx.audit.audit_log:
        target = f"{entry.target_type} {entry.target_id}" if entry.target_id else entry.target_type
        base = [entry.created_at, entry.actor_name or "—", entry.actor_kind, entry.action, target]
        changed = change_rows(entry.changes)
        if not changed:
            rows.append([*base, "—", "—", entry.note or "—"])
            continue
        for field_name, before, after in changed:
            rows.append([*base, field_name, _render(before), _render(after)])

    return [
        Paragraph("Registo Administrativo", styles()["Heading1"]),
        grid(rows, weighted_widths([1.3, 1.6, 1, 2, 1.8, 1.4, 1.4, 1.4])),
    ]


def _render(value: Any) -> str:
    """A diff side as short display text.

    `result_data`, `penalties` and `bonuses` are themselves JSON, so their
    before/after are structures rather than scalars; the workbook keeps the
    untruncated rendering.
    """
    if value is None:
        return "—"
    if isinstance(value, str | int | float | bool):
        rendered = text(value)
    else:
        try:
            rendered = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
        except (TypeError, ValueError):
            rendered = str(value)
    return rendered if len(rendered) <= _MAX_RENDERED else rendered[: _MAX_RENDERED - 1] + "…"
