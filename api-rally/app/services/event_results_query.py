"""Shared read/aggregation layer for an event's results.

Both the Excel export (`export_service.py`) and the PDF report
(`pdf_report_service.py`) need the same DB reads and the same
per-(team, checkpoint) score aggregation — extracted here so the two
document builders can't drift out of sync on what counts as a team's score
at a checkpoint. Pure reads: never recomputes or writes scores.

Beyond the scores, this layer answers *what actually happened* in the event:
which penalty and bonus counters were really used, whether a team ever
reached a checkpoint, whether hints, skips, manual awards, badges or photos
featured at all. The document builders consult those answers to decide which
columns and sections to emit, so a report never shows a column for a mechanic
the event did not use.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.badge import TeamBadge
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.checkpoint_skip import CheckpointSkip
from app.models.dynamic_scoring import BONUS_COUNTER_RULE_TYPE, DynamicAward, DynamicRule
from app.models.rally_settings import RallySettings
from app.models.team import Team

#: Built-in penalty keys written by the staff evaluation form. Only ever
#: present on an event with drinking mechanics (see `scoring_service`).
VOMIT_KEY = "vomit"
NOT_DRINKING_KEY = "not_drinking"

#: Prefixes `scoring_service` files DynamicRule counts under, one per side,
#: so the two namespaces can never collide.
PENALTY_RULE_PREFIX = "g_"
BONUS_RULE_PREFIX = "gb_"

#: `ActivityResult.judgment_status` for a capture that is recorded but not
#: yet scored — completed, with `final_score` still NULL.
PENDING_JUDGMENT = "pending_judgment"

_BUILTIN_LABELS = {
    VOMIT_KEY: "Vómitos",
    NOT_DRINKING_KEY: "Não bebeu",
}

type _CheckpointEngagement = CheckpointArrival | CheckpointHintReveal | CheckpointSkip


def team_opponent_map(teams: list[Team]) -> dict[int, str]:
    """Map team_id -> opponent name via versus_group_id pairing.

    Two teams sharing a non-null ``versus_group_id`` are opponents. Teams with
    no group (or an unpaired group) map to an empty string.
    """
    by_group: dict[int, list[Team]] = {}
    for team in teams:
        if team.versus_group_id is not None:
            by_group.setdefault(team.versus_group_id, []).append(team)

    opponent: dict[int, str] = {t.id: "" for t in teams}
    for group in by_group.values():
        if len(group) == 2:
            a, b = group
            opponent[a.id] = b.name
            opponent[b.id] = a.name
    return opponent


def _as_number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _mapping(result: ActivityResult, attr: str) -> dict[str, Any]:
    """One of the four count/points dicts on a result, tolerating NULL.

    Read through ``getattr`` rather than attribute access because the unit
    tests build results as ``SimpleNamespace`` and only set the fields the
    case under test cares about.
    """
    value = getattr(result, attr, None)
    return value if isinstance(value, dict) else {}


def result_penalty(result: ActivityResult, key: str) -> int:
    """Penalty *points* accumulated under ``key`` (a positive magnitude)."""
    return int(_as_number(_mapping(result, "penalties").get(key, 0)))


def result_bonus(result: ActivityResult, key: str) -> int:
    """Bonus *points* accumulated under ``key``."""
    return int(_as_number(_mapping(result, "bonuses").get(key, 0)))


def result_count(result: ActivityResult, key: str, *, bonus: bool = False) -> int:
    """How many times ``key`` was counted on this result.

    The counts are the authoritative record of what staff observed: the
    matching points dict is the count priced at whatever the rate was, so a
    rate of 0 makes a real occurrence look like nothing happened.
    """
    attr = "bonus_counts" if bonus else "penalty_counts"
    return int(_as_number(_mapping(result, attr).get(key, 0)))


def result_notes(result: ActivityResult) -> str:
    notes = (getattr(result, "result_data", None) or {}).get("notes")
    return str(notes) if notes else ""


def _rule_prefix(rule: DynamicRule) -> str:
    """The namespace `scoring_service` files this rule's counts under."""
    if rule.rule_type == BONUS_COUNTER_RULE_TYPE:
        return BONUS_RULE_PREFIX
    return PENALTY_RULE_PREFIX


def _counted_keys(results: list[ActivityResult], *, bonus: bool) -> set[str]:
    """Keys for which a real occurrence *count* was persisted.

    Rows written before counts existed (migrations 0047 / 0056) carry only
    the priced points, so a key can be genuinely used and still not be
    counted. The two cannot share a column without mixing units.
    """
    attr = "bonus_counts" if bonus else "penalty_counts"
    return {
        str(key)
        for result in results
        for key, value in _mapping(result, attr).items()
        if _as_number(value)
    }


def _used_keys(results: list[ActivityResult], *, bonus: bool) -> list[str]:
    """Keys that genuinely occurred, in first-seen order.

    Counts are the primary signal; the points dict is the fallback for rows
    written before counts were persisted (migrations 0047 / 0056), where a
    non-zero amount is the only surviving evidence the key was used.
    """
    counts_attr = "bonus_counts" if bonus else "penalty_counts"
    points_attr = "bonuses" if bonus else "penalties"
    seen: dict[str, None] = {}
    for result in results:
        for attr in (counts_attr, points_attr):
            for key, value in _mapping(result, attr).items():
                if _as_number(value):
                    seen.setdefault(str(key), None)
    return list(seen)


def _index_results(
    results: list[ActivityResult], team_ids: set[int]
) -> tuple[
    dict[tuple[int, int], float],
    dict[tuple[int, int], ActivityResult],
    set[tuple[int, int]],
    set[tuple[int, int]],
]:
    """Build per-checkpoint result indexes from valid team results."""
    scores: dict[tuple[int, int], float] = {}
    latest: dict[tuple[int, int], ActivityResult] = {}
    attended: set[tuple[int, int]] = set()
    pending: set[tuple[int, int]] = set()
    for result in results:
        activity = getattr(result, "activity", None)
        checkpoint = activity.checkpoint if activity else None
        if checkpoint is None or result.team_id not in team_ids:
            continue
        key = (result.team_id, checkpoint.id)
        if result.is_completed and result.final_score is not None:
            scores[key] = scores.get(key, 0.0) + float(result.final_score)
        latest[key] = result
        attended.add(key)
        if (
            getattr(result, "judgment_status", None) == PENDING_JUDGMENT
            and result.final_score is None
        ):
            pending.add(key)
    return scores, latest, attended, pending


def _engaged_checkpoints(
    arrivals: list[CheckpointArrival],
    hint_reveals: list[CheckpointHintReveal],
    skips: list[CheckpointSkip],
    team_ids: set[int],
    checkpoint_ids: set[int],
) -> set[tuple[int, int]]:
    """Return valid team/checkpoint pairs represented by side-mechanic records."""
    engagements: list[_CheckpointEngagement] = [*arrivals, *hint_reveals, *skips]
    return {
        (row.team_id, row.checkpoint_id)
        for row in engagements
        if row.team_id in team_ids and row.checkpoint_id in checkpoint_ids
    }


def _counter_entries(config: dict[str, Any]) -> list[tuple[str, str, float]]:
    """Normalize configured counter entries, discarding malformed values."""
    entries: list[tuple[str, str, float]] = []
    for field_name in ("penalty_counters", "bonus_counters"):
        for entry in config.get(field_name) or []:
            if isinstance(entry, dict) and (key := entry.get("key")):
                key_text = str(key)
                entries.append(
                    (
                        key_text,
                        str(entry.get("label") or entry.get("name") or key),
                        _as_number(entry.get("points")),
                    )
                )
    return entries


@dataclass
class EventResultsData:
    """Everything a results document (Excel sheet, PDF report, ...) needs,
    read once and shared between however many sections/sheets it builds.

    Only ``teams``/``checkpoints``/``results`` are required; the rest default
    to empty so a caller that needs nothing but the scores — and the unit
    tests — can build one cheaply. A missing list simply reads as "that
    mechanic did not feature", which is also what the documents do with it.
    """

    teams: list[Team]
    checkpoints: list[CheckPoint]
    results: list[ActivityResult]
    event: RallyEvent | None = None
    settings: RallySettings | None = None
    arrivals: list[CheckpointArrival] = field(default_factory=list)
    hint_reveals: list[CheckpointHintReveal] = field(default_factory=list)
    skips: list[CheckpointSkip] = field(default_factory=list)
    awards: list[DynamicAward] = field(default_factory=list)
    rules: list[DynamicRule] = field(default_factory=list)
    badges: list[TeamBadge] = field(default_factory=list)

    opponent_of: dict[int, str] = field(init=False)
    # (team_id, checkpoint_id) -> summed final_score.
    cp_score: dict[tuple[int, int], float] = field(init=False)
    # (team_id, checkpoint_id) -> the last result row seen, for per-checkpoint detail.
    cp_result: dict[tuple[int, int], ActivityResult] = field(init=False)
    # (team_id, checkpoint_id) the team demonstrably reached — a result row or
    # a recorded arrival. Absence is what separates "never went there" from
    # "went and scored nothing".
    attended: set[tuple[int, int]] = field(init=False)
    # (team_id, checkpoint_id) holding a capture that is recorded but unscored.
    pending: set[tuple[int, int]] = field(init=False)
    penalty_keys_used: list[str] = field(init=False)
    bonus_keys_used: list[str] = field(init=False)

    def __post_init__(self) -> None:
        self.opponent_of = team_opponent_map(self.teams)
        team_ids = {t.id for t in self.teams}
        cp_ids = {c.id for c in self.checkpoints}
        cp_score, cp_result, attended, pending = _index_results(self.results, team_ids)

        # An arrival, a bought hint or a skip are each proof the team engaged
        # with the post, even where no result was ever scored there. Without
        # them a team that gave up on a checkpoint reads as never having gone,
        # which is the opposite of what happened.
        attended.update(
            _engaged_checkpoints(self.arrivals, self.hint_reveals, self.skips, team_ids, cp_ids)
        )

        self.cp_score = cp_score
        self.cp_result = cp_result
        self.attended = attended
        self.pending = pending
        self.penalty_keys_used = _used_keys(self.results, bonus=False)
        self.bonus_keys_used = _used_keys(self.results, bonus=True)
        self._counted_penalties = _counted_keys(self.results, bonus=False)
        self._counted_bonuses = _counted_keys(self.results, bonus=True)

        self._rule_by_key = {f"{_rule_prefix(r)}{r.id}": r for r in self.rules}
        self._counter_labels, self._counter_points = self._collect_counters()

    def _collect_counters(self) -> tuple[dict[str, str], dict[str, float]]:
        """Labels and per-occurrence rates for the counters an activity declares.

        A counter entry in `activity.config` may carry a human label; when it
        does not, the key is all the report has to name the column with.
        """
        labels: dict[str, str] = {}
        points: dict[str, float] = {}
        for result in self.results:
            activity = getattr(result, "activity", None)
            config = getattr(activity, "config", None) or {}
            if not isinstance(config, dict):
                continue
            for key, label, point_value in _counter_entries(config):
                labels[key] = label
                points[key] = point_value
        return labels, points

    # ---------- naming ----------

    def key_label(self, key: str) -> str:
        """Human label for a penalty/bonus key, for a column header."""
        if key in _BUILTIN_LABELS:
            return _BUILTIN_LABELS[key]
        rule = self._rule_by_key.get(key)
        if rule is not None:
            return rule.name
        label = self._counter_labels.get(key)
        if label:
            return label
        return key.replace("_", " ").capitalize()

    def key_is_counted(self, key: str, *, bonus: bool = False) -> bool:
        """Does this key report occurrences, or only the points they cost?

        A column has to pick one: showing a count for some rows and points
        for others would put two units under one header.
        """
        return key in (self._counted_bonuses if bonus else self._counted_penalties)

    def key_amount(self, result: ActivityResult, key: str, *, bonus: bool = False) -> int:
        """What this column shows for one result, in that column's unit."""
        if self.key_is_counted(key, bonus=bonus):
            return result_count(result, key, bonus=bonus)
        return result_bonus(result, key) if bonus else result_penalty(result, key)

    def key_points(self, key: str) -> float:
        """Points one occurrence of ``key`` is worth, as a magnitude.

        Returns 0.0 when the rate cannot be resolved — a rate of 0 is also a
        legitimate configuration ("free"), so callers must treat 0 as "no rate
        worth printing" rather than as evidence the key is unused.
        """
        rule = self._rule_by_key.get(key)
        if rule is not None:
            return abs(_as_number(rule.points))
        if key in self._counter_points:
            return abs(self._counter_points[key])
        if self.settings is not None:
            builtin = {
                VOMIT_KEY: getattr(self.settings, "penalty_per_puke", 0),
                NOT_DRINKING_KEY: getattr(self.settings, "penalty_per_not_drinking", 0),
            }
            if key in builtin:
                return abs(_as_number(builtin[key]))
        return 0.0

    def team_name(self, team_id: int) -> str:
        for team in self.teams:
            if team.id == team_id:
                return team.name
        return f"#{team_id}"

    def checkpoint_name(self, checkpoint_id: int) -> str:
        for checkpoint in self.checkpoints:
            if checkpoint.id == checkpoint_id:
                return checkpoint.name
        return f"#{checkpoint_id}"

    # ---------- scores ----------

    def team_total(self, team_id: int) -> float:
        return sum(score for (tid, _cp_id), score in self.cp_score.items() if tid == team_id)

    def team_attended(self, team_id: int, checkpoint_id: int) -> bool:
        return (team_id, checkpoint_id) in self.attended

    def team_pending(self, team_id: int) -> bool:
        return any(tid == team_id for tid, _cp in self.pending)

    def checkpoint_used(self, checkpoint_id: int) -> bool:
        """Did anything at all happen at this checkpoint?"""
        return any(cp_id == checkpoint_id for _team_id, cp_id in self.attended)

    def used_checkpoints(self) -> list[CheckPoint]:
        return [cp for cp in self.checkpoints if self.checkpoint_used(cp.id)]

    # ---------- per-team rollups ----------

    def hints_by_team(self, team_id: int) -> list[CheckpointHintReveal]:
        return [h for h in self.hint_reveals if h.team_id == team_id]

    def skips_by_team(self, team_id: int) -> list[CheckpointSkip]:
        return [s for s in self.skips if s.team_id == team_id]

    def manual_awards(self) -> list[DynamicAward]:
        """Admin one-off adjustments only.

        An award carrying an ``activity_result_id`` is the automatic
        penalty-overflow carry for that result, already visible in the
        checkpoint's penalty columns; repeating it as a manual adjustment
        would double-count it to the reader.
        """
        return [
            a
            for a in self.awards
            if getattr(a, "activity_result_id", None) is None and getattr(a, "is_active", True)
        ]

    def badges_by_team(self, team_id: int) -> list[TeamBadge]:
        return [b for b in self.badges if b.team_id == team_id]

    # ---------- "did this feature happen" ----------

    @property
    def has_versus(self) -> bool:
        return any(self.opponent_of.get(t.id) for t in self.teams) or any(
            getattr(r, "team_vs_result", None) for r in self.results
        )

    @property
    def has_extra_shots(self) -> bool:
        return any(int(_as_number(getattr(r, "extra_shots", 0))) for r in self.results)

    @property
    def has_notes(self) -> bool:
        return any(result_notes(r) for r in self.results)

    @property
    def has_media(self) -> bool:
        return any(getattr(t, "photo_url", "") for t in self.teams) or any(
            getattr(r, "media_urls", None) for r in self.results
        )

    @property
    def has_hints(self) -> bool:
        return bool(self.hint_reveals)

    @property
    def has_skips(self) -> bool:
        return bool(self.skips)

    @property
    def has_awards(self) -> bool:
        return bool(self.manual_awards())

    @property
    def has_badges(self) -> bool:
        return bool(self.badges)

    @property
    def has_pending_judgment(self) -> bool:
        return bool(self.pending)


class EventResultsQuery:
    """Read-only DB access for one event's teams/checkpoints/results."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def event(self, event_id: int) -> RallyEvent | None:
        return await self.db.get(RallyEvent, event_id)

    async def settings(self, event_id: int) -> RallySettings | None:
        stmt = select(RallySettings).where(RallySettings.event_id == event_id)
        row: RallySettings | None = await self.db.scalar(stmt)
        return row

    async def teams(self, event_id: int) -> list[Team]:
        stmt = select(Team).where(Team.event_id == event_id).order_by(Team.name)
        return list((await self.db.scalars(stmt)).all())

    async def checkpoints(self, event_id: int) -> list[CheckPoint]:
        stmt = select(CheckPoint).where(CheckPoint.event_id == event_id).order_by(CheckPoint.order)
        return list((await self.db.scalars(stmt)).all())

    async def results(self, event_id: int) -> list[ActivityResult]:
        """All results whose checkpoint belongs to this event."""
        stmt = (
            select(ActivityResult)
            .options(joinedload(ActivityResult.activity).joinedload(Activity.checkpoint))
            .join(ActivityResult.activity)
            .join(Activity.checkpoint)
            .where(CheckPoint.event_id == event_id)
        )
        return list((await self.db.scalars(stmt)).all())

    async def arrivals(self, event_id: int) -> list[CheckpointArrival]:
        stmt = (
            select(CheckpointArrival)
            .join(Team, Team.id == CheckpointArrival.team_id)
            .where(Team.event_id == event_id)
        )
        return list((await self.db.scalars(stmt)).all())

    async def hint_reveals(self, event_id: int) -> list[CheckpointHintReveal]:
        stmt = (
            select(CheckpointHintReveal)
            .join(Team, Team.id == CheckpointHintReveal.team_id)
            .where(Team.event_id == event_id)
            .order_by(CheckpointHintReveal.revealed_at)
        )
        return list((await self.db.scalars(stmt)).all())

    async def skips(self, event_id: int) -> list[CheckpointSkip]:
        stmt = (
            select(CheckpointSkip)
            .join(Team, Team.id == CheckpointSkip.team_id)
            .where(Team.event_id == event_id)
            .order_by(CheckpointSkip.skipped_at)
        )
        return list((await self.db.scalars(stmt)).all())

    async def awards(self, event_id: int) -> list[DynamicAward]:
        stmt = (
            select(DynamicAward)
            .where(DynamicAward.event_id == event_id)
            .order_by(DynamicAward.awarded_at)
        )
        return list((await self.db.scalars(stmt)).all())

    async def rules(self, event_id: int) -> list[DynamicRule]:
        """Every rule the event ever had, tombstoned ones included.

        A deleted or deactivated rule can still be the reason a scored result
        carries a ``g_<id>`` key, and the report needs its name to label that
        column; ``deleted_at`` says nothing about whether the rule was used.
        """
        stmt = select(DynamicRule).where(DynamicRule.event_id == event_id)
        return list((await self.db.scalars(stmt)).all())

    async def badges(self, event_id: int) -> list[TeamBadge]:
        stmt = (
            select(TeamBadge)
            .join(Team, Team.id == TeamBadge.team_id)
            .where(Team.event_id == event_id)
            .order_by(TeamBadge.awarded_at)
        )
        return list((await self.db.scalars(stmt)).all())

    async def load(self, event_id: int) -> EventResultsData:
        return EventResultsData(
            teams=await self.teams(event_id),
            checkpoints=await self.checkpoints(event_id),
            results=await self.results(event_id),
            event=await self.event(event_id),
            settings=await self.settings(event_id),
            arrivals=await self.arrivals(event_id),
            hint_reveals=await self.hint_reveals(event_id),
            skips=await self.skips(event_id),
            awards=await self.awards(event_id),
            rules=await self.rules(event_id),
            badges=await self.badges(event_id),
        )
