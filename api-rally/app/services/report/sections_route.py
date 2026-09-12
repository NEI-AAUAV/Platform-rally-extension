"""Route section: one dossier page per post, as it was planned.

Carries the staff-only material — the briefing, the challenge description and
the hint ladder's expected answers — which no participant-facing schema ever
returns. That is the point of an admin-only archive, and the reason this
section must never be reachable from a team-facing route.
"""

from __future__ import annotations

from typing import Any

from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer

from app.services.event_report_context import EventReportContext
from app.services.report.tables import facts, grid, keep, styles, weighted_widths


def route_dossier(ctx: EventReportContext) -> list[object]:
    if not ctx.checkpoints:
        return []

    story: list[object] = [Paragraph("Fichas dos Postos", styles()["Heading1"])]
    for index, checkpoint in enumerate(ctx.checkpoints, start=1):
        story += _checkpoint_page(ctx, checkpoint, index)
    story += _global_activities(ctx)
    return story


def _checkpoint_page(ctx: EventReportContext, checkpoint: Any, index: int) -> list[object]:
    stage = ctx.content.stage(getattr(checkpoint, "stage_id", None))
    attended = sum(1 for t in ctx.teams if ctx.results.team_attended(t.id, checkpoint.id))

    rows: list[list[Any]] = [["Ordem", checkpoint.order]]
    if stage is not None:
        rows.append(["Etapa", stage.name])
    rows.append(["Equipas que passaram", attended])
    if getattr(checkpoint, "is_draft", False):
        rows.append(["Estado", "rascunho (nunca publicado)"])
    if getattr(checkpoint, "is_placeholder", False):
        rows.append(["Estado", "marcador de posição"])

    for label, attr in (
        ("Descrição", "description"),
        ("Pista", "clue"),
        ("Guião do staff", "staff_script"),
        ("Desafio", "challenge_brief"),
    ):
        value = getattr(checkpoint, attr, None)
        if value:
            rows.append([label, value])

    latitude = getattr(checkpoint, "latitude", None)
    longitude = getattr(checkpoint, "longitude", None)
    if latitude is not None and longitude is not None:
        rows.append(
            [
                "Coordenadas",
                f"{latitude}, {longitude} (raio {getattr(checkpoint, 'arrival_radius_m', '')}m)",
            ]
        )
    window = _window(checkpoint)
    if window:
        rows.append(["Horário", window])

    story: list[object] = [
        keep(
            Paragraph(f"Posto {index}: {checkpoint.name}", styles()["Heading2"]),
            facts(rows, 4 * cm),
        )
    ]
    story += _activities_table(ctx, checkpoint.id)
    story += _hint_ladder(ctx, checkpoint.id)
    story += _media_table(ctx, checkpoint.id)
    story += _staff_line(ctx, checkpoint.id)
    story.append(Spacer(1, 0.5 * cm))
    return story


def _activities_table(ctx: EventReportContext, checkpoint_id: int) -> list[object]:
    activities = ctx.content.activities_at(checkpoint_id)
    if not activities:
        return []
    rows: list[list[Any]] = [["Atividade", "Tipo", "Ativa", "Pontuação configurada"]]
    for activity in activities:
        rows.append(
            [
                activity.name,
                activity.activity_type,
                "sim" if getattr(activity, "is_active", True) else "não",
                _config_summary(activity),
            ]
        )
    return [grid(rows, weighted_widths([2.5, 2.5, 0.8, 4])), Spacer(1, 0.2 * cm)]


def _hint_ladder(ctx: EventReportContext, checkpoint_id: int) -> list[object]:
    rungs = ctx.content.indications_at(checkpoint_id)
    if not rungs:
        return []
    sold: dict[int, int] = {}
    for reveal in ctx.results.hint_reveals:
        sold[reveal.indication_id] = sold.get(reveal.indication_id, 0) + 1

    rows: list[list[Any]] = [["#", "Pista", "Pergunta", "Resposta esperada", "Vendida"]]
    for rung in rungs:
        rows.append(
            [
                rung.order + 1,
                rung.hint,
                getattr(rung, "question", "") or "—",
                getattr(rung, "expected_answer", "") or "—",
                sold.get(rung.id, 0),
            ]
        )
    return [grid(rows, weighted_widths([0.4, 3, 2.5, 2.5, 0.8])), Spacer(1, 0.2 * cm)]


def _media_table(ctx: EventReportContext, checkpoint_id: int) -> list[object]:
    items = ctx.content.media_at(checkpoint_id)
    if not items:
        return []
    rows: list[list[Any]] = [["Tipo", "Título", "Legenda", "Ligação"]]
    for item in items:
        rows.append(
            [
                getattr(item.kind, "value", item.kind),
                getattr(item, "title", "") or "—",
                getattr(item, "caption", "") or "—",
                getattr(item, "content_url", "")
                or getattr(item, "image_url", "")
                or getattr(item, "content_text", "")
                or "—",
            ]
        )
    return [grid(rows, weighted_widths([1, 2, 3, 3])), Spacer(1, 0.2 * cm)]


def _staff_line(ctx: EventReportContext, checkpoint_id: int) -> list[object]:
    assignments = ctx.roster.staff_at(checkpoint_id)
    if not assignments:
        return []
    names = ", ".join(ctx.roster.name_of(a.user_id) for a in assignments)
    return [Paragraph(f"Staff: {names}", styles()["Normal"])]


def _global_activities(ctx: EventReportContext) -> list[object]:
    """Activities not tied to a post; they belong to no checkpoint page."""
    activities = ctx.content.global_activities()
    if not activities:
        return []
    rows: list[list[Any]] = [["Atividade", "Tipo", "Ativa", "Pontuação configurada"]]
    for activity in activities:
        rows.append(
            [
                activity.name,
                activity.activity_type,
                "sim" if getattr(activity, "is_active", True) else "não",
                _config_summary(activity),
            ]
        )
    return [
        Paragraph("Atividades Globais", styles()["Heading2"]),
        grid(rows, weighted_widths([2.5, 2.5, 0.8, 4])),
    ]


def _config_summary(activity: Any) -> str:
    """The scoring knobs an activity was set up with.

    `Activity.config` is a free-form dict that nothing validates, so this
    reads whatever is there rather than assuming a per-type shape.
    """
    config = getattr(activity, "config", None)
    if not isinstance(config, dict):
        return "—"
    parts = [
        f"{key}={value}"
        for key, value in sorted(config.items())
        if isinstance(value, int | float | str) and not isinstance(value, bool)
    ]
    return ", ".join(parts) or "—"


def _window(checkpoint: Any) -> str:
    start = getattr(checkpoint, "available_from", None)
    end = getattr(checkpoint, "available_until", None)
    if start and end:
        return f"{start:%d/%m %H:%M} — {end:%d/%m %H:%M}"
    if start:
        return f"a partir de {start:%d/%m %H:%M}"
    if end:
        return f"até {end:%d/%m %H:%M}"
    return ""
