"""The per-checkpoint column set, decided once for both report formats.

The Excel export and the PDF report show the same breakdown of a team's
result at a checkpoint. Building that column list here — from what the event
actually recorded rather than from a fixed template — is what keeps a report
free of columns for mechanics the event never used, and keeps the two
documents from disagreeing about which ones those are.

Each column carries both headers: the workbook is written in English, the
report in Portuguese. Penalty and bonus labels come from the data either way,
since a counter's name is whatever staff configured.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.models.activity import ActivityResult
from app.models.checkpoint import CheckPoint
from app.models.team import Team
from app.services.event_results_query import (
    EventResultsData,
    result_count,
    result_notes,
)

#: What a cell shows for a checkpoint the team never reached. Distinct from a
#: zero, which means the team was there and scored nothing.
ABSENT_XLSX = ""
ABSENT_PDF = "—"

#: What the points cell shows for a capture recorded but not yet judged.
PENDING_LABEL = "por avaliar"


@dataclass(frozen=True)
class ReportColumn:
    """One column of a per-checkpoint breakdown.

    ``value`` is called only for a team that attended the checkpoint; a team
    that did not gets the absent marker in every column but the first.
    """

    header_en: str
    header_pt: str
    value: Callable[[EventResultsData, Team, CheckPoint, ActivityResult | None], Any]
    numeric: bool = True


def _points_suffix(data: EventResultsData, key: str, sign: str) -> str:
    """`" (-2)"` when the rate is known, `" (-)"` when it is not."""
    points = data.key_points(key)
    return f" ({sign}{points:g})" if points else f" ({sign})"


def _counter_getter(
    key: str, *, bonus: bool
) -> Callable[[EventResultsData, Team, CheckPoint, ActivityResult | None], Any]:
    """A reader bound to one counter key.

    A factory rather than an inline lambda because a closure written inside
    the loop would capture the loop variable, giving every column the last
    key's counts.
    """

    def read(
        _data: EventResultsData,
        _team: Team,
        _checkpoint: CheckPoint,
        result: ActivityResult | None,
    ) -> Any:
        return result_count(result, key, bonus=bonus) if result else 0

    return read


def _score_cell(data: EventResultsData, team: Team, checkpoint: CheckPoint) -> Any:
    key = (team.id, checkpoint.id)
    if key in data.pending and key not in data.cp_score:
        return PENDING_LABEL
    return data.cp_score.get(key, 0.0)


def checkpoint_columns(data: EventResultsData) -> list[ReportColumn]:
    """The columns worth showing for this event's checkpoint breakdowns.

    Team and points are unconditional — every event has both. Everything else
    earns its place by having happened at least once.
    """
    columns: list[ReportColumn] = [
        ReportColumn(
            "Team",
            "Equipa",
            lambda _d, team, _cp, _r: team.name,
            numeric=False,
        )
    ]

    if data.has_versus:
        columns.append(
            ReportColumn(
                "Versus Pair",
                "Adversário",
                lambda d, team, _cp, _r: d.opponent_of.get(team.id, ""),
                numeric=False,
            )
        )
        columns.append(
            ReportColumn(
                "Match Result",
                "Resultado",
                lambda _d, _team, _cp, result: (
                    getattr(result, "team_vs_result", None) or "" if result else ""
                ),
                numeric=False,
            )
        )

    if data.has_extra_shots:
        columns.append(
            ReportColumn(
                "Extra Shots",
                "Tiros extra",
                lambda _d, _team, _cp, result: (
                    int(getattr(result, "extra_shots", 0) or 0) if result else 0
                ),
            )
        )

    for key in data.penalty_keys_used:
        label = data.key_label(key)
        suffix = _points_suffix(data, key, "-")
        columns.append(
            ReportColumn(
                f"{label}{suffix}",
                f"{label}{suffix}",
                _counter_getter(key, bonus=False),
            )
        )

    for key in data.bonus_keys_used:
        label = data.key_label(key)
        suffix = _points_suffix(data, key, "+")
        columns.append(
            ReportColumn(
                f"{label}{suffix}",
                f"{label}{suffix}",
                _counter_getter(key, bonus=True),
            )
        )

    if data.has_notes:
        columns.append(
            ReportColumn(
                "Notes",
                "Notas",
                lambda _d, _team, _cp, result: result_notes(result) if result else "",
                numeric=False,
            )
        )

    columns.append(
        ReportColumn(
            "Total Checkpoint",
            "Pontos",
            lambda d, team, checkpoint, _r: _score_cell(d, team, checkpoint),
        )
    )
    return columns


def checkpoint_row(
    data: EventResultsData,
    columns: list[ReportColumn],
    team: Team,
    checkpoint: CheckPoint,
    *,
    absent: str,
) -> list[Any]:
    """One team's row, or the team's name against absent markers.

    A team that never reached the checkpoint has no zero to report: it has no
    reading at all, and filling the row with zeroes is what made the old
    reports unreadable.
    """
    if not data.team_attended(team.id, checkpoint.id):
        return [team.name] + [absent] * (len(columns) - 1)

    result = data.cp_result.get((team.id, checkpoint.id))
    return [column.value(data, team, checkpoint, result) for column in columns]
