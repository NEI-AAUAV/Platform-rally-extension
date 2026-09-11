"""People sections: team rosters, staff on posts, guides, and route progress."""

from __future__ import annotations

from typing import Any

from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer

from app.services.event_report_context import EventReportContext, display_name
from app.services.report.tables import grid, keep, styles, text, weighted_widths


def teams_and_members(ctx: EventReportContext) -> list[object]:
    """Each team with its roster, or just the teams when no roster was recorded."""
    if not ctx.teams:
        return []

    story: list[object] = [Paragraph("Equipas", styles()["Heading1"])]
    for team in ctx.ranked_teams():
        members = ctx.roster.members_of(team.id)
        guides = ctx.roster.guides_of(team.id)
        heading = Paragraph(
            f"{team.name} — {text(ctx.team_recorded_total(team.id))} pontos",
            styles()["Heading2"],
        )
        if not members:
            story.append(heading)
            story.append(Paragraph("Sem membros registados.", styles()["Normal"]))
            story.append(Spacer(1, 0.3 * cm))
            continue

        rows: list[list[Any]] = [["ID", "Nome", "Email", "Capitão", "Conta associada"]]
        for member in members:
            sub = getattr(member, "authentik_sub", None)
            rows.append(
                [
                    member.id,
                    display_name(member),
                    getattr(member, "email", "") or "—",
                    "sim" if member.is_captain else "",
                    # No OIDC subject means a placeholder an admin typed in,
                    # not a person who has ever signed in.
                    "sim" if sub else "não",
                ]
            )
        story.append(keep(heading, grid(rows, weighted_widths([0.6, 2.4, 3, 0.9, 1.1]))))
        if guides:
            names = ", ".join(ctx.roster.name_of(g.user_id) for g in guides)
            story.append(Paragraph(f"Guia: {names}", styles()["Normal"]))
        story.append(Spacer(1, 0.4 * cm))
    return story


def staff(ctx: EventReportContext) -> list[object]:
    """Who was on which post."""
    if not ctx.roster.has_staff:
        return []

    cp_name = {c.id: c.name for c in ctx.checkpoints}
    rows: list[list[Any]] = [["Posto", "ID", "Nome", "Email"]]
    for assignment in ctx.roster.staff_assignments:
        user = ctx.roster.user(assignment.user_id)
        rows.append(
            [
                cp_name.get(assignment.checkpoint_id, "—") if assignment.checkpoint_id else "—",
                assignment.user_id,
                display_name(user),
                getattr(user, "email", "") or "—",
            ]
        )
    return [
        Paragraph("Staff por Posto", styles()["Heading1"]),
        grid(rows, weighted_widths([2.4, 0.6, 2.4, 3])),
    ]


def guides(ctx: EventReportContext) -> list[object]:
    """Which guide accompanied which team."""
    if not ctx.roster.has_guides:
        return []

    team_name = {t.id: t.name for t in ctx.teams}
    rows: list[list[Any]] = [["Guia", "ID", "Email", "Equipa", "Postos alcançados"]]
    for assignment in ctx.roster.guide_assignments:
        user = ctx.roster.user(assignment.user_id)
        team_id = assignment.team_id
        reached = (
            sum(1 for c in ctx.checkpoints if ctx.results.team_attended(team_id, c.id))
            if team_id is not None
            else 0
        )
        rows.append(
            [
                display_name(user),
                assignment.user_id,
                getattr(user, "email", "") or "—",
                team_name.get(team_id, "—") if team_id is not None else "—",
                reached,
            ]
        )
    return [
        Paragraph("Guias", styles()["Heading1"]),
        grid(rows, weighted_widths([2.4, 0.6, 3, 2.4, 1.2])),
    ]


def progress(ctx: EventReportContext) -> list[object]:
    """Each team's route, in route order, with arrival times where recorded.

    Arrivals come from the arrival rows rather than `Team.times`, which is
    appended in visit order and so does not line up with route order.
    """
    tables: list[object] = []
    for team in ctx.teams:
        legs = ctx.team_progress(team)
        if not legs:
            continue
        rows: list[list[Any]] = [["#", "Posto", "Chegada", "Minutos", "Pontos"]]
        previous = None
        for leg, (checkpoint, arrived_at, score) in enumerate(legs, start=1):
            minutes = ""
            if arrived_at is not None and previous is not None:
                minutes = f"{(arrived_at - previous).total_seconds() / 60:.0f}"
            rows.append([leg, checkpoint.name, arrived_at, minutes, text(score)])
            if arrived_at is not None:
                previous = arrived_at
        tables.append(
            keep(
                Paragraph(team.name, styles()["Heading2"]),
                grid(rows, weighted_widths([0.5, 3, 1.5, 1, 1])),
            )
        )
        tables.append(Spacer(1, 0.4 * cm))

    if not tables:
        return []
    return [Paragraph("Progresso das Equipas", styles()["Heading1"]), *tables]
