"""Everything a full event dossier needs, read once and shared.

`EventResultsData` answers what teams *scored*. This module answers the rest
of the questions a post-event report has to answer: who ran the event, who
played in it, what the route actually asked of them, and who changed a score
afterwards. The two documents (`app.services.export`, `app.services.report`)
both build from one of these, so neither can describe the event differently.

Grouped into three bundles plus the scores, because the four have genuinely
different lifetimes — people and route content exist before the event runs,
results and the audit trail only after — and because keeping them apart is
what lets a section ask "did this happen" with a single truthy check.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.audit_log import AuditLog
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.checkpoint_media import CheckpointMedia
from app.models.evaluation_history import EvaluationHistory
from app.models.participation import EventParticipation
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.models.route_stage import RouteStage
from app.models.team import Team
from app.models.user import User
from app.services.event_results_query import EventResultsData

#: `RallySettings` switches worth reporting, with the label the dossier uses.
#: Only the flags that change what teams could do — branding and layout say
#: nothing about how the event ran.
REPORTED_SETTINGS: tuple[tuple[str, str], ...] = (
    ("enable_versus", "Confrontos diretos"),
    ("checkpoint_order_matters", "Ordem dos postos obrigatória"),
    ("enable_staff_scoring", "Avaliação por staff"),
    ("gps_checkin_enabled", "Check-in por GPS"),
    ("reveal_next_checkpoint", "Revelar próximo posto"),
    ("hints_enabled", "Pistas"),
    ("skip_enabled", "Desistência de posto"),
    ("guide_manual_arrival_enabled", "Chegada manual pelo guia"),
    ("reveal_on_arrival", "Revelar à chegada"),
    ("proximity_enabled", "Proximidade"),
    ("compass_enabled", "Bússola"),
    ("route_stages_enabled", "Etapas de percurso"),
    ("checkpoint_hours_enabled", "Horários de posto"),
    ("leg_time_scoring_enabled", "Pontuação por tempo de trajeto"),
    ("guide_mode_enabled", "Modo guia"),
    ("badges_enabled", "Medalhas"),
    ("participant_view_enabled", "Vista de participante"),
    ("public_access_enabled", "Acesso público"),
)


def display_name(user: User | None) -> str:
    """A name for a person that is always printable.

    ``name`` is the only non-nullable identifier on `User`, but placeholder
    members created by an admin have been seen with it blank, and the rest of
    the codebase already writes ``(u.name or "")`` defensively.
    """
    if user is None:
        return "—"
    return (user.name or "").strip() or (user.email or "").strip() or f"user#{user.id}"


@dataclass
class EventRoster:
    """The people: staff on posts, guides on teams, members in teams."""

    staff_assignments: list[RallyStaffAssignment] = field(default_factory=list)
    guide_assignments: list[RallyGuideAssignment] = field(default_factory=list)
    members: list[User] = field(default_factory=list)
    staff_users: list[User] = field(default_factory=list)
    participations: list[EventParticipation] = field(default_factory=list)

    def __post_init__(self) -> None:
        self._by_id = {u.id: u for u in (*self.members, *self.staff_users)}

    def user(self, user_id: int | None) -> User | None:
        return self._by_id.get(user_id) if user_id is not None else None

    def name_of(self, user_id: int | None) -> str:
        return display_name(self.user(user_id))

    def members_of(self, team_id: int) -> list[User]:
        """Captain first, then by name — the order a roster is read in."""
        members = [m for m in self.members if m.team_id == team_id]
        return sorted(members, key=lambda m: (not m.is_captain, (m.name or "").lower()))

    def staff_at(self, checkpoint_id: int) -> list[RallyStaffAssignment]:
        return [a for a in self.staff_assignments if a.checkpoint_id == checkpoint_id]

    def guides_of(self, team_id: int) -> list[RallyGuideAssignment]:
        return [a for a in self.guide_assignments if a.team_id == team_id]

    def participation_of(self, authentik_sub: str | None) -> EventParticipation | None:
        if not authentik_sub:
            return None
        for p in self.participations:
            if p.authentik_sub == authentik_sub:
                return p
        return None

    @property
    def has_staff(self) -> bool:
        return bool(self.staff_assignments)

    @property
    def has_guides(self) -> bool:
        return bool(self.guide_assignments)

    @property
    def has_members(self) -> bool:
        return bool(self.members)


@dataclass
class EventContent:
    """The route as it was planned: activities, hints, media, stages."""

    activities: list[Activity] = field(default_factory=list)
    indications: list[CheckpointGuideIndication] = field(default_factory=list)
    media: list[CheckpointMedia] = field(default_factory=list)
    stages: list[RouteStage] = field(default_factory=list)

    def activities_at(self, checkpoint_id: int) -> list[Activity]:
        return [a for a in self.activities if a.checkpoint_id == checkpoint_id]

    def global_activities(self) -> list[Activity]:
        return [a for a in self.activities if a.checkpoint_id is None]

    def indications_at(self, checkpoint_id: int) -> list[CheckpointGuideIndication]:
        rungs = [i for i in self.indications if i.checkpoint_id == checkpoint_id]
        return sorted(rungs, key=lambda i: (i.order, i.id))

    def media_at(self, checkpoint_id: int) -> list[CheckpointMedia]:
        items = [m for m in self.media if m.checkpoint_id == checkpoint_id]
        return sorted(items, key=lambda m: (m.order, m.id))

    def stage(self, stage_id: int | None) -> RouteStage | None:
        if stage_id is None:
            return None
        for s in self.stages:
            if s.id == stage_id:
                return s
        return None

    @property
    def has_activities(self) -> bool:
        return bool(self.activities)

    @property
    def has_indications(self) -> bool:
        return bool(self.indications)

    @property
    def has_media(self) -> bool:
        return bool(self.media)

    @property
    def has_stages(self) -> bool:
        return bool(self.stages)


@dataclass
class EventAuditTrail:
    """Who changed what: score edits, team contests, admin actions."""

    evaluations: list[EvaluationHistory] = field(default_factory=list)
    audit_log: list[AuditLog] = field(default_factory=list)
    #: result_id -> the result, so a history row can name its team/checkpoint.
    result_by_id: dict[int, ActivityResult] = field(default_factory=dict)

    def result_of(self, history: EvaluationHistory) -> ActivityResult | None:
        return self.result_by_id.get(history.result_id)

    def evaluations_by_editor(self, editor_id: str) -> list[EvaluationHistory]:
        return [h for h in self.evaluations if h.editor_id == editor_id]

    @property
    def has_evaluations(self) -> bool:
        return bool(self.evaluations)

    @property
    def has_audit_log(self) -> bool:
        return bool(self.audit_log)


def change_rows(changes: Any) -> list[tuple[str, Any, Any]]:
    """Flatten a `{field: {"before", "after"}}` diff into printable rows.

    Both audit trails share this shape (`app/services/_diff.py`). A contest
    carries no diff at all, and a malformed entry is skipped rather than
    allowed to break a whole sheet.
    """
    if not isinstance(changes, dict):
        return []
    rows: list[tuple[str, Any, Any]] = []
    for name, delta in changes.items():
        if isinstance(delta, dict) and ("before" in delta or "after" in delta):
            rows.append((str(name), delta.get("before"), delta.get("after")))
        else:
            rows.append((str(name), None, delta))
    return rows


@dataclass
class EventReportContext:
    """The whole dossier: scores, people, route content and audit trail."""

    results: EventResultsData
    roster: EventRoster = field(default_factory=EventRoster)
    content: EventContent = field(default_factory=EventContent)
    audit: EventAuditTrail = field(default_factory=EventAuditTrail)

    # ---------- passthrough to the score layer ----------

    @property
    def event(self) -> RallyEvent | None:
        return self.results.event

    @property
    def teams(self) -> list[Team]:
        return self.results.teams

    @property
    def checkpoints(self) -> list[CheckPoint]:
        return self.results.checkpoints

    # ---------- score reconciliation ----------

    def team_adjustments(self, team_id: int) -> float:
        """Everything folded into `Team.total` that no checkpoint column shows.

        Hint and skip costs and manual awards are applied by `ScoringService`
        against the team's total, never against a per-checkpoint score, so a
        report that only sums checkpoints silently disagrees with the live
        leaderboard on any event that used them.
        """
        hints = sum(float(h.cost or 0) for h in self.results.hint_reveals if h.team_id == team_id)
        skips = sum(float(s.cost or 0) for s in self.results.skips if s.team_id == team_id)
        awards = sum(
            float(a.points or 0) for a in self.results.manual_awards() if a.team_id == team_id
        )
        return hints + skips + awards

    def team_recorded_total(self, team_id: int) -> float:
        """`Team.total` — what the leaderboard actually shows."""
        for team in self.results.teams:
            if team.id == team_id:
                return float(getattr(team, "total", 0) or 0)
        return 0.0

    def ranked_teams(self) -> list[Team]:
        """Teams in leaderboard order.

        Ranked by the recorded total rather than the checkpoint sum, so the
        dossier and the live leaderboard agree on who won.
        """
        return sorted(
            self.results.teams, key=lambda t: self.team_recorded_total(t.id), reverse=True
        )

    def totals_reconcile(self) -> bool:
        """Does every team's checkpoint sum plus adjustments equal its total?

        A mismatch is worth printing rather than hiding: it means a score was
        changed without the team total being recomputed.
        """
        return all(
            abs(
                self.results.team_total(t.id)
                + self.team_adjustments(t.id)
                - self.team_recorded_total(t.id)
            )
            < 0.01
            for t in self.results.teams
        )

    # ---------- per-team progress ----------

    def team_progress(self, team: Team) -> list[tuple[CheckPoint, datetime | None, float]]:
        """(checkpoint, arrival, score) in route order.

        The arrival comes from `checkpoint_arrivals`, not from `Team.times`:
        those two arrays use different indexing regimes — `times` is appended
        in *visit* order by `Team.record_checkpoint`, while
        `score_per_checkpoint` is rebuilt in *route* order by the scorer — so
        lining them up by position silently mismatches any team that visited
        out of order.
        """
        arrival_at = {
            a.checkpoint_id: a.arrived_at for a in self.results.arrivals if a.team_id == team.id
        }
        rows: list[tuple[CheckPoint, datetime | None, float]] = []
        for checkpoint in self.results.checkpoints:
            if not self.results.team_attended(team.id, checkpoint.id):
                continue
            rows.append(
                (
                    checkpoint,
                    arrival_at.get(checkpoint.id),
                    self.results.cp_score.get((team.id, checkpoint.id), 0.0),
                )
            )
        return rows

    def enabled_settings(self) -> list[tuple[str, bool]]:
        """The reported switches and their state, or empty with no settings row."""
        settings_row = self.results.settings
        if settings_row is None:
            return []
        return [
            (label, bool(getattr(settings_row, attr, False)))
            for attr, label in REPORTED_SETTINGS
            if hasattr(settings_row, attr)
        ]
