"""Route sheets: the posts themselves, their activities, hints, media, stages.

This is the event as it was *planned*, including the staff-only material —
briefings, challenge descriptions and the hint ladder's answer key — which
no participant-facing schema ever carries. It belongs in an admin-only
dossier and nowhere else.
"""

from __future__ import annotations

from typing import Any

from openpyxl import Workbook

from app.services.checkpoint_planning import missing_fields
from app.services.event_report_context import EventReportContext
from app.services.export import formulas as f
from app.services.export.sheets_results import ResultsIndex
from app.services.export.styles import add_sheet

#: `Activity.config` keys worth a column of their own. The config is a
#: free-form dict that nothing validates, so each is read defensively and the
#: whole dict is also kept in a final column.
_CONFIG_KEYS = (
    "max_points",
    "min_points",
    "base_score",
    "success_points",
    "failure_points",
    "win_points",
    "draw_points",
    "lose_points",
    "base_points",
    "completion_points",
    "default_points",
    "max_bonus_points",
)


def build_checkpoints_sheet(wb: Workbook, ctx: EventReportContext, index: ResultsIndex) -> None:
    """One row per planned post, whether or not any team reached it."""
    data = ctx.results
    if not data.checkpoints:
        return

    settings_row = data.settings
    requires_coordinates = bool(getattr(settings_row, "gps_checkin_enabled", False))
    requires_clue = not bool(getattr(settings_row, "reveal_next_checkpoint", True))
    requires_stage = bool(getattr(settings_row, "route_stages_enabled", False))

    headers = [
        "Order",
        "Name",
        "Stage",
        "Teams Attended",
        "Results",
        "Average Score",
        "Activities",
        "Staff",
        "Hint Rungs",
        "Media",
        "Latitude",
        "Longitude",
        "Radius (m)",
        "Available From",
        "Available Until",
        "Draft",
        "Placeholder",
        "Missing",
        "Description",
        "Clue",
        "Staff Script",
        "Challenge Brief",
    ]

    rows: list[list[Any]] = []
    for checkpoint in data.checkpoints:
        activities = ctx.content.activities_at(checkpoint.id)
        staff = ctx.roster.staff_at(checkpoint.id)
        attended = sum(1 for team in data.teams if data.team_attended(team.id, checkpoint.id))
        stage = ctx.content.stage(getattr(checkpoint, "stage_id", None))
        criterion = f.quote(checkpoint.name)
        rows.append(
            [
                checkpoint.order,
                checkpoint.name,
                getattr(stage, "name", "") if stage else "",
                attended,
                _count_results(index, criterion),
                _average_score(index, criterion),
                len(activities),
                len(staff),
                len(ctx.content.indications_at(checkpoint.id)),
                len(ctx.content.media_at(checkpoint.id)),
                getattr(checkpoint, "latitude", None),
                getattr(checkpoint, "longitude", None),
                getattr(checkpoint, "arrival_radius_m", None),
                getattr(checkpoint, "available_from", None),
                getattr(checkpoint, "available_until", None),
                "yes" if getattr(checkpoint, "is_draft", False) else "no",
                "yes" if getattr(checkpoint, "is_placeholder", False) else "no",
                ", ".join(
                    missing_fields(
                        checkpoint,
                        has_activity=bool(activities),
                        has_staff=bool(staff),
                        requires_coordinates=requires_coordinates,
                        requires_clue=requires_clue,
                        requires_stage=requires_stage,
                    )
                ),
                getattr(checkpoint, "description", "") or "",
                getattr(checkpoint, "clue", "") or "",
                getattr(checkpoint, "staff_script", "") or "",
                getattr(checkpoint, "challenge_brief", "") or "",
            ]
        )

    add_sheet(wb, "Checkpoints", headers, rows, center_from=3, text_cols={19, 20, 21, 22})


def build_activities_sheet(wb: Workbook, ctx: EventReportContext, index: ResultsIndex) -> None:
    """One row per activity, with its configured awards and its outcomes."""
    activities = ctx.content.activities
    if not activities:
        return

    cp_name = {c.id: c.name for c in ctx.results.checkpoints}
    headers = [
        "Checkpoint",
        "Activity",
        "Type",
        "Global",
        "Active",
        "Available From",
        "Available Until",
        "Results",
        "Total Points",
        "Average Points",
        *[k.replace("_", " ").title() for k in _CONFIG_KEYS],
        "Penalty Counters",
        "Bonus Counters",
        "Description",
        "Config",
    ]

    rows: list[list[Any]] = []
    for activity in activities:
        config = activity.config if isinstance(activity.config, dict) else {}
        criterion = f.quote(activity.name)
        rows.append(
            [
                cp_name.get(activity.checkpoint_id, "") if activity.checkpoint_id else "(global)",
                activity.name,
                activity.activity_type,
                "yes" if getattr(activity, "is_global", False) else "no",
                "yes" if getattr(activity, "is_active", True) else "no",
                getattr(activity, "available_from", None),
                getattr(activity, "available_until", None),
                _count_results(index, criterion, column=index.activity_col),
                _sum_score(index, criterion),
                _average_score(index, criterion, column=index.activity_col),
                *[config.get(key) for key in _CONFIG_KEYS],
                _counter_summary(config, "penalty_counters"),
                _counter_summary(config, "bonus_counters"),
                getattr(activity, "description", "") or "",
                config,
            ]
        )

    text_cols = {len(headers) - 1, len(headers)}
    add_sheet(wb, "Activities", headers, rows, center_from=3, text_cols=text_cols)


def build_hint_ladder_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    """The hint ladder with its questions and answers, and how often each sold."""
    if not ctx.content.has_indications:
        return

    cp_name = {c.id: c.name for c in ctx.results.checkpoints}
    reveals: dict[int, list[Any]] = {}
    for reveal in ctx.results.hint_reveals:
        reveals.setdefault(reveal.indication_id, []).append(reveal)

    headers = [
        "Checkpoint",
        "Rung",
        "Times Revealed",
        "Total Cost",
        "Hint",
        "Question",
        "Expected Answer",
    ]
    rows: list[list[Any]] = []
    for indication in ctx.content.indications:
        bought = reveals.get(indication.id, [])
        rows.append(
            [
                cp_name.get(indication.checkpoint_id, ""),
                indication.order + 1,
                len(bought),
                sum(int(r.cost or 0) for r in bought),
                indication.hint,
                getattr(indication, "question", "") or "",
                getattr(indication, "expected_answer", "") or "",
            ]
        )

    add_sheet(wb, "Hint Ladder", headers, rows, center_from=2, text_cols={5, 6, 7})


def build_media_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    """Checkpoint media, whose meaningful fields depend on the kind."""
    if not ctx.content.has_media:
        return

    cp_name = {c.id: c.name for c in ctx.results.checkpoints}
    headers = [
        "Checkpoint",
        "Order",
        "Kind",
        "Title",
        "Caption",
        "Image URL",
        "Content URL",
        "Text",
    ]
    rows = [
        [
            cp_name.get(item.checkpoint_id, ""),
            item.order,
            getattr(item.kind, "value", item.kind),
            getattr(item, "title", "") or "",
            getattr(item, "caption", "") or "",
            getattr(item, "image_url", "") or "",
            getattr(item, "content_url", "") or "",
            getattr(item, "content_text", "") or "",
        ]
        for item in ctx.content.media
    ]
    add_sheet(wb, "Checkpoint Media", headers, rows, center_from=2, text_cols={5, 8})


def build_stages_sheet(wb: Workbook, ctx: EventReportContext) -> None:
    """Route stages, with the posts that fall inside each one."""
    if not ctx.content.has_stages:
        return

    headers = ["Order", "Stage", "Order Matters", "Required Posts", "Checkpoints"]
    rows: list[list[Any]] = []
    for stage in ctx.content.stages:
        members = [c for c in ctx.results.checkpoints if getattr(c, "stage_id", None) == stage.id]
        rows.append(
            [
                stage.order,
                stage.name,
                "yes" if stage.order_matters else "no",
                # NULL means every post in the stage is required; 0 is a real
                # value meaning none are, so this must test for null.
                len(members) if stage.required_count is None else stage.required_count,
                ", ".join(c.name for c in members),
            ]
        )
    add_sheet(wb, "Route Stages", headers, rows, center_from=2, text_cols={5})


# ---------- formula helpers ----------


def _count_results(index: ResultsIndex, criterion: str, *, column: int | None = None) -> Any:
    if index.is_empty:
        return 0
    return f.count_if(index.range(column or index.checkpoint_col), criterion)


def _sum_score(index: ResultsIndex, criterion: str, *, column: int | None = None) -> Any:
    if index.is_empty:
        return 0
    return f.sum_if(
        index.range(column or index.activity_col), criterion, index.range(index.score_col)
    )


def _average_score(index: ResultsIndex, criterion: str, *, column: int | None = None) -> Any:
    if index.is_empty:
        return ""
    return f.average_if(
        index.range(column or index.checkpoint_col), criterion, index.range(index.score_col)
    )


def _counter_summary(config: dict[str, Any], key: str) -> str:
    """`"asneira=3, atraso=5"` for a counter list, empty when absent."""
    entries = config.get(key)
    if not isinstance(entries, list):
        return ""
    parts = []
    for entry in entries:
        if isinstance(entry, dict) and entry.get("key"):
            parts.append(f"{entry['key']}={entry.get('points', 0)}")
    return ", ".join(parts)
