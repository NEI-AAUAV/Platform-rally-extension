"""Score sections: cover, event record, ranking, per-checkpoint detail, stats."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, Spacer, Table, TableStyle

from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.checkpoint_skip import CheckpointSkip
from app.services.event_report_columns import ABSENT_PDF, checkpoint_columns, checkpoint_row
from app.services.event_report_context import EventReportContext
from app.services.report.tables import (
    HEADER_BG,
    facts,
    grid,
    keep,
    styles,
    text,
    weighted_widths,
)

_PODIUM_FILLS = {
    1: colors.HexColor("#FFD700"),
    2: colors.HexColor("#C0C0C0"),
    3: colors.HexColor("#CD7F32"),
}

EVENT_TYPE_LABELS = {
    "rally_tascas": "Rally das Tascas",
    "peddy_paper": "Peddy Paper",
    "olympic": "Olimpíadas",
    "generic": "Evento",
}


def cover(ctx: EventReportContext, event_id: int) -> list[object]:
    event = ctx.event
    name = getattr(event, "name", None) or f"Evento #{event_id}"
    title = ParagraphStyle("CoverTitle", parent=styles()["Title"], fontSize=26, spaceAfter=6)
    subtitle = ParagraphStyle("CoverSubtitle", parent=styles()["Normal"], fontSize=13)

    lines: list[object] = [
        Spacer(1, 4 * cm),
        Paragraph(name, title),
        Paragraph("Relatório Final", subtitle),
    ]

    event_type = getattr(event, "event_type", None)
    if event_type:
        lines.append(Paragraph(EVENT_TYPE_LABELS.get(str(event_type), str(event_type)), subtitle))

    period = _period_text(event)
    if period:
        lines.append(Paragraph(period, subtitle))

    lines.append(
        Paragraph(
            f"{len(ctx.teams)} equipas · {len(ctx.results.used_checkpoints())} postos realizados",
            subtitle,
        )
    )
    lines.append(Paragraph(f"Emitido a {datetime.now().strftime('%d/%m/%Y')}", subtitle))
    lines.append(PageBreak())
    return lines


def event_record(ctx: EventReportContext) -> list[object]:
    """The event's own record: identity, window, scale, mechanics enabled."""
    event = ctx.event
    data = ctx.results
    rows: list[list[Any]] = [
        ["Nome", getattr(event, "name", "") or "—"],
        ["Tipo", EVENT_TYPE_LABELS.get(str(getattr(event, "event_type", "")), "—")],
        ["Início", getattr(event, "start_time", None)],
        ["Fim", getattr(event, "end_time", None)],
        ["Equipas", len(data.teams)],
        ["Postos planeados", len(data.checkpoints)],
        ["Postos realizados", len(data.used_checkpoints())],
        ["Atividades", len(ctx.content.activities)],
        ["Resultados registados", len(data.results)],
    ]
    if not ctx.totals_reconcile():
        # Worth stating rather than hiding: a checkpoint sum that disagrees
        # with the team total means a score moved without a recompute.
        rows.append(["Aviso", "Os totais por posto não batem certo com o total das equipas."])

    story: list[object] = [Paragraph("Ficha do Evento", styles()["Heading1"]), facts(rows)]

    enabled = ctx.enabled_settings()
    if enabled:
        story.append(Spacer(1, 0.5 * cm))
        story.append(Paragraph("Mecânicas ativas", styles()["Heading2"]))
        story.append(
            grid(
                [
                    ["Definição", "Estado"],
                    *[[label, "sim" if on else "não"] for label, on in enabled],
                ],
                weighted_widths([3, 1]),
            )
        )
    return story


def ranking(ctx: EventReportContext) -> list[object]:
    """Final standings, ranked by the recorded total.

    Ranking by the checkpoint sum would put an event that used hints, skips or
    manual awards in a different order from its own live leaderboard.
    """
    if not ctx.teams:
        return []

    story: list[object] = [Paragraph("Ranking Final", styles()["Heading1"])]
    if ctx.results.has_pending_judgment:
        story.append(
            Paragraph("Classificação provisória: há resultados por avaliar.", styles()["Normal"])
        )
        story.append(Spacer(1, 0.3 * cm))

    ranked = ctx.ranked_teams()
    rows: list[list[Any]] = [["#", "Equipa", "Postos", "Ajustes", "Total"]]
    for position, team in enumerate(ranked, start=1):
        label = text(ctx.team_recorded_total(team.id))
        if ctx.results.team_pending(team.id):
            label += " *"
        rows.append(
            [
                str(position),
                team.name,
                text(ctx.results.team_total(team.id)),
                text(ctx.team_adjustments(team.id)),
                label,
            ]
        )

    table = Table(rows, colWidths=weighted_widths([0.6, 4, 1.2, 1.2, 1.2]))
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ALIGN", (1, 1), (1, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ]
    for position, fill in _PODIUM_FILLS.items():
        if position <= len(ranked):
            style.append(("BACKGROUND", (0, position), (-1, position), fill))
    table.setStyle(TableStyle(style))
    story.append(table)
    return story


def checkpoint_detail(ctx: EventReportContext) -> list[object]:
    """One table per post that anything happened at."""
    data = ctx.results
    checkpoints = data.used_checkpoints()
    if not checkpoints:
        return []

    columns = checkpoint_columns(data)
    headers = [c.header_pt for c in columns]
    widths = weighted_widths([2.0 if not c.numeric else 1.0 for c in columns])
    story: list[object] = [Paragraph("Detalhe por Posto", styles()["Heading1"])]

    for index, checkpoint in enumerate(checkpoints, start=1):
        rows: list[list[Any]] = [list(headers)]
        rows += [
            checkpoint_row(data, columns, team, checkpoint, absent=ABSENT_PDF)
            for team in data.teams
        ]
        story.append(
            keep(
                Paragraph(f"Posto {index}: {checkpoint.name}", styles()["Heading2"]),
                grid(rows, widths),
            )
        )
        story.append(Spacer(1, 0.5 * cm))
    return story


def statistics(ctx: EventReportContext) -> list[object]:
    """Counts that only make sense once, gathered at the end."""
    data = ctx.results
    rows: list[list[Any]] = []

    duration = _duration_text(ctx.event)
    if duration:
        rows.append(["Duração do evento", duration])
    rows.append(["Número de equipas", str(len(data.teams))])

    used = data.used_checkpoints()
    if len(used) == len(data.checkpoints):
        rows.append(["Número de postos", str(len(used))])
    else:
        rows.append(["Postos realizados", f"{len(used)} de {len(data.checkpoints)}"])

    rows += _statistic_rows(ctx)

    return [Paragraph("Estatísticas do Evento", styles()["Heading1"]), facts(rows, 8 * cm)]


def _statistic_rows(ctx: EventReportContext) -> list[list[Any]]:
    """Rows for counters, optional mechanics, and checkpoint comparisons."""
    data = ctx.results
    rows = _counter_statistic_rows(
        data, data.penalty_keys_used, "penalização", "pontos de penalização"
    )
    rows += _counter_statistic_rows(
        data, data.bonus_keys_used, "bónus", "pontos de bónus", bonus=True
    )
    optional_rows: list[
        tuple[bool, str, list[CheckpointHintReveal] | list[CheckpointSkip]]
    ] = [
        (data.has_hints, "Pistas reveladas", data.hint_reveals),
        (data.has_skips, "Postos desistidos", data.skips),
    ]
    for enabled, label, records in optional_rows:
        if enabled:
            cost = sum(int(record.cost or 0) for record in records)
            rows.append([label, f"{len(records)} ({cost:+d} pontos)"])
    rows += [
        [label, value]
        for enabled, label, value in (
            (data.has_badges, "Medalhas atribuídas", str(len(data.badges))),
            (data.has_pending_judgment, "Resultados por avaliar", str(len(data.pending))),
            (
                ctx.audit.has_evaluations,
                "Alterações a avaliações",
                str(len(ctx.audit.evaluations)),
            ),
        )
        if enabled
    ]
    return rows + _checkpoint_extremes(ctx)


def _counter_statistic_rows(
    data: Any, keys: list[str], counted_unit: str, points_unit: str, *, bonus: bool = False
) -> list[list[Any]]:
    return [
        [
            f"{data.key_label(key)} ("
            f"{counted_unit if data.key_is_counted(key, bonus=bonus) else points_unit})",
            str(sum(data.key_amount(result, key, bonus=bonus) for result in data.results)),
        ]
        for key in keys
    ]


def _checkpoint_extremes(ctx: EventReportContext) -> list[list[Any]]:
    """Best/worst average-scoring post, when the comparison means anything.

    With fewer than two scored posts the same one is both best and worst,
    which tells the reader nothing.
    """
    data = ctx.results
    averages: dict[int, float] = {}
    for checkpoint in data.checkpoints:
        scores = [
            score for (_team_id, cp_id), score in data.cp_score.items() if cp_id == checkpoint.id
        ]
        if scores:
            averages[checkpoint.id] = sum(scores) / len(scores)

    if len(averages) < 2:
        return []

    best = max(averages.items(), key=lambda kv: kv[1])
    worst = min(averages.items(), key=lambda kv: kv[1])
    return [
        ["Posto com maior pontuação média", f"{data.checkpoint_name(best[0])} ({best[1]:.1f})"],
        ["Posto com menor pontuação média", f"{data.checkpoint_name(worst[0])} ({worst[1]:.1f})"],
    ]


def _period_text(event: object) -> str:
    start = getattr(event, "start_time", None)
    end = getattr(event, "end_time", None)
    if isinstance(start, datetime) and isinstance(end, datetime):
        return f"{start.strftime('%d/%m/%Y')} — {end.strftime('%d/%m/%Y')}"
    if isinstance(start, datetime):
        return start.strftime("%d/%m/%Y")
    return ""


def _duration_text(event: object) -> str:
    start = getattr(event, "start_time", None)
    end = getattr(event, "end_time", None)
    if isinstance(start, datetime) and isinstance(end, datetime) and end > start:
        return str(end - start)
    return ""
