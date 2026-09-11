"""People sheets: staff on posts, guides on teams, members in teams, progress.

Identities carry the internal user id alongside name and email so a row can
be reconciled against the other systems this platform mirrors. Both export
endpoints are admin-only.
"""

from __future__ import annotations

from typing import Any

from openpyxl import Workbook

from app.services.event_report_context import EventReportContext, display_name
from app.services.export.styles import add_sheet


def build_staff_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    """Who was stationed where, and how many evaluations they went on to edit."""
    if not ctx.roster.has_staff:
        return

    cp_name = {c.id: c.name for c in ctx.results.checkpoints}
    edits = _edits_by_editor(ctx)

    headers = ["User ID", "Name", "Email", "Checkpoint", "Scopes", "Disabled", "Score Edits"]
    rows: list[list[Any]] = []
    for assignment in ctx.roster.staff_assignments:
        user = ctx.roster.user(assignment.user_id)
        rows.append(
            [
                assignment.user_id,
                display_name(user),
                getattr(user, "email", "") or "",
                cp_name.get(assignment.checkpoint_id, "") if assignment.checkpoint_id else "",
                getattr(user, "scopes", None) or [],
                "yes" if getattr(user, "disabled", False) else "no",
                # `EvaluationHistory.editor_id` is the OIDC subject for a
                # staff edit, not the local user id, so match on both.
                edits.get(str(assignment.user_id), 0)
                + edits.get(str(getattr(user, "authentik_sub", "") or ""), 0),
            ]
        )
    add_sheet(wb, "Staff", headers, rows, center_from=4)


def build_guides_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    """Which guide walked with which team, and how that team ended up."""
    if not ctx.roster.has_guides:
        return

    team_name = {t.id: t.name for t in ctx.results.teams}
    headers = [
        "User ID",
        "Name",
        "Email",
        "Team",
        "Posts Reached",
        "Checkpoint Subtotal",
        "Recorded Total",
    ]
    rows: list[list[Any]] = []
    for assignment in ctx.roster.guide_assignments:
        user = ctx.roster.user(assignment.user_id)
        team_id = assignment.team_id
        reached = (
            sum(1 for c in ctx.results.checkpoints if ctx.results.team_attended(team_id, c.id))
            if team_id is not None
            else 0
        )
        rows.append(
            [
                assignment.user_id,
                display_name(user),
                getattr(user, "email", "") or "",
                team_name.get(team_id, "") if team_id is not None else "",
                reached,
                ctx.results.team_total(team_id) if team_id is not None else 0,
                ctx.team_recorded_total(team_id) if team_id is not None else 0,
            ]
        )
    add_sheet(wb, "Guides", headers, rows, center_from=4)


def build_members_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    """The rosters, captain first within each team."""
    if not ctx.roster.has_members:
        return

    headers = [
        "Team",
        "User ID",
        "Name",
        "Email",
        "Captain",
        "Linked Account",
        "Disabled",
        "Claimed Participation",
    ]
    rows: list[list[Any]] = []
    for team in ctx.results.teams:
        for member in ctx.roster.members_of(team.id):
            sub = getattr(member, "authentik_sub", None)
            participation = ctx.roster.participation_of(sub)
            rows.append(
                [
                    team.name,
                    member.id,
                    display_name(member),
                    getattr(member, "email", "") or "",
                    "yes" if member.is_captain else "no",
                    # A member with no OIDC subject is a placeholder an admin
                    # typed in, not a person who has ever signed in.
                    "yes" if sub else "no",
                    "yes" if getattr(member, "disabled", False) else "no",
                    "yes" if participation is not None else "no",
                ]
            )
    add_sheet(wb, "Team Members", headers, rows, center_from=2)


def build_progress_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    """Each team's route: where it got to, when, and for how many points.

    Arrivals come from `checkpoint_arrivals` rather than `Team.times`: that
    array is appended in visit order while `score_per_checkpoint` is rebuilt
    in route order, so pairing the two by position mismatches any team that
    went out of order.
    """
    data = ctx.results
    rows: list[list[Any]] = []
    for team in data.teams:
        previous = None
        for leg, (checkpoint, arrived_at, score) in enumerate(ctx.team_progress(team), start=1):
            leg_minutes: Any = ""
            if arrived_at is not None and previous is not None:
                leg_minutes = round((arrived_at - previous).total_seconds() / 60, 1)
            rows.append(
                [
                    team.name,
                    leg,
                    checkpoint.order,
                    checkpoint.name,
                    arrived_at,
                    leg_minutes,
                    score,
                    "yes" if (team.id, checkpoint.id) in data.pending else "no",
                ]
            )
            if arrived_at is not None:
                previous = arrived_at

    if not rows:
        return

    headers = [
        "Team",
        "Leg",
        "Order",
        "Checkpoint",
        "Arrived At",
        "Leg Minutes",
        "Score",
        "Pending Judgment",
    ]
    add_sheet(wb, "Team Progress", headers, rows, center_from=2)


def _edits_by_editor(ctx: EventReportContext) -> dict[str, int]:
    counts: dict[str, int] = {}
    for history in ctx.audit.evaluations:
        key = history.editor_id or ""
        counts[key] = counts.get(key, 0) + 1
    return counts
