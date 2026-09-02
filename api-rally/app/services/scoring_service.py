"""
Scoring system service for Rally activities
"""

import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.config import get_settings
from app.core.exceptions import RallyError, RallyValidationError
from app.core.metrics import observe_scoring_recompute
from app.core.observability import traced
from app.crud._event_scope import current_event_id
from app.crud.crud_activity import activity_result as activity_result_crud
from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
from app.crud.crud_team import team as team_crud
from app.crud.crud_versus import versus
from app.events import (
    ActivityResultChangedPayload,
    ActivityResultCreatedEvent,
    ActivityResultDeletedEvent,
    ActivityResultUpdatedEvent,
    BaseEvent,
    TeamScoreUpdatedEvent,
    TeamScoreUpdatedPayload,
    publish_event,
)
from app.models.activity import Activity, ActivityResult, EventType, RallyEvent
from app.models.activity_factory import ActivityFactory
from app.models.dynamic_scoring import DynamicAward, DynamicRule
from app.models.evaluation_history import EvaluationAction, EvaluationHistory
from app.models.rally_settings import RallySettings
from app.models.team import Team
from app.schemas.activity import (
    ActivityResultCreate,
    ActivityResultStaffUpdate,
    ActivityResultUpdate,
)
from app.schemas.activity_types import ActivityType
from app.services._diff import diff_snapshots, snapshot_fields

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScoreBreakdown:
    """Result of scoring one activity result.

    ``final`` is floored at 0 and is what persists on
    ``ActivityResult.final_score``. ``raw`` keeps the pre-floor value so a
    penalty larger than the activity's points can be carried to ``team.total``
    instead of vanishing at the floor.
    """

    final: float
    raw: float


@dataclass(frozen=True)
class EvaluationEditor:
    """Who is editing a result, for the audit trail.

    ``id``/``name`` are copied verbatim into the history row so the trail stays
    readable even if the underlying user or team is later renamed or removed.
    """

    id: str
    name: str


_AUDITED_FIELDS = (
    "final_score",
    "points_score",
    "time_score",
    "boolean_score",
    "team_vs_result",
    "extra_shots",
    "result_data",
    "penalties",
)

_ACTIVITY_SCORING_LOCK_NAMESPACE = 41_205


def _snapshot_result(result: ActivityResult) -> dict[str, Any]:
    """Deep-copy the audited fields of a result for later diffing."""
    return snapshot_fields(result, _AUDITED_FIELDS)


def _diff_snapshots(before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Field-level {field: {"before", "after"}} for values that changed."""
    return diff_snapshots(before, after, _AUDITED_FIELDS)


class ScoringService:
    """Service for handling Rally scoring rules and calculations"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._settings: RallySettings | None = None
        # Events produced by ``commit=False`` writes, held until the caller's
        # own transaction commits (see ``_stage_event`` / ``publish_staged_events``).
        self._staged_events: list[BaseEvent] = []

    def _stage_event(self, event: BaseEvent) -> None:
        """Queue an event to publish *after* an external transaction commits.

        The ``commit=False`` write paths (notably the idempotency transaction in
        ``evaluate_team_activity``) do not own their commit, so they cannot
        publish safely: publishing before the commit lets subscribers observe
        state a rollback would erase, and dropping the event leaves SSE, other
        sessions, caches, badges and the scoring worker unaware of the write.
        The owning caller drains this queue via ``publish_staged_events`` once
        ``store_idempotent_response`` (or equivalent) has committed.
        """
        self._staged_events.append(event)

    async def publish_staged_events(self) -> None:
        """Publish and clear every event queued by ``commit=False`` writes.

        Call only after the transaction that produced these mutations has
        committed. Safe to call unconditionally — a no-op when nothing staged.
        """
        events, self._staged_events = self._staged_events, []
        for event in events:
            await publish_event(event)

    @staticmethod
    def _result_change_event(
        event_cls: type[
            ActivityResultCreatedEvent | ActivityResultUpdatedEvent | ActivityResultDeletedEvent
        ],
        *,
        result_id: int,
        team_id: int,
        activity_id: int,
    ) -> BaseEvent:
        return event_cls(
            payload=ActivityResultChangedPayload(
                result_id=result_id, team_id=team_id, activity_id=activity_id
            )
        )

    @staticmethod
    def _team_score_events(totals: dict[int, float]) -> list[BaseEvent]:
        return [
            TeamScoreUpdatedEvent(
                payload=TeamScoreUpdatedPayload(team_id=team_id, total_score=total_score)
            )
            for team_id, total_score in sorted(totals.items())
        ]

    @property
    def _defer_recompute(self) -> bool:
        """Whether the heavy recompute is handled by the scoring worker.

        Only defers when both the kill-switch is on AND the realtime subsystem
        is enabled — without a running worker, deferring would leave team
        totals permanently stale.
        """
        settings = get_settings()
        return settings.RECOMPUTE_OFF_PATH and settings.EVENTS_ENABLED

    async def _team_size(self, team_id: int) -> int:
        """Number of members on a team (min 1 for scoring)"""
        team = await self.db.scalar(
            select(Team).options(selectinload(Team.members)).where(Team.id == team_id)
        )
        return len(team.members) if team and team.members else 1

    async def _completed_times(
        self, activity_id: int, extra_time: float | None = None
    ) -> list[float]:
        """All completion times for an activity's completed results

        Pass extra_time to include a result not yet persisted (create path)
        """

        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id, ActivityResult.is_completed.is_(True)
        )

        times = [
            float(r.time_score)
            for r in (await self.db.scalars(stmt)).all()
            if r.time_score is not None
        ]

        if extra_time is not None:
            times.append(extra_time)

        return times

    async def compute_final_score(
        self,
        *,
        activity_type: str,
        config: dict[str, Any],
        result_data: dict[str, Any],
        team_size: int,
        extra_shots: int = 0,
        penalties: dict[str, Any] | None = None,
        all_times: list[float] | None = None,
    ) -> float:
        """Persisted per-activity score (floored at 0). See compute_score_breakdown."""
        breakdown = await self.compute_score_breakdown(
            activity_type=activity_type,
            config=config,
            result_data=result_data,
            team_size=team_size,
            extra_shots=extra_shots,
            penalties=penalties,
            all_times=all_times,
        )
        return breakdown.final

    async def compute_score_breakdown(
        self,
        *,
        activity_type: str,
        config: dict[str, Any],
        result_data: dict[str, Any],
        team_size: int,
        extra_shots: int = 0,
        penalties: dict[str, Any] | None = None,
        all_times: list[float] | None = None,
    ) -> "ScoreBreakdown":
        """Single source of truth for scoring a result.

        ``final`` is what lands on ``ActivityResult.final_score`` (never below
        0). ``raw`` is the same sum before that floor; when it is negative the
        caller records the shortfall as a penalty award so a penalty bigger
        than the activity's points still reaches ``team.total``.

        For time-based games, pass all_times (the full set to rank against,
        including this result's own time) to use relative ranking; otherwise,
        base scoring.
        """

        instance = ActivityFactory.create_activity(activity_type, config)

        is_time_based = activity_type == ActivityType.TIME_BASED.value
        this_time = result_data.get("completion_time_seconds")

        if is_time_based and this_time is not None:
            if (
                all_times
                and len(all_times) > 1
                and hasattr(instance, "calculate_relative_ranking_score")
            ):
                base_score = float(
                    instance.calculate_relative_ranking_score(all_times, float(this_time))
                )
            else:
                base_score = float(instance.config.get("max_points", 100))
        else:
            base_score = float(instance.calculate_score(result_data, team_size))

        settings = await self._get_settings()
        has_drinking_mechanics = await self._has_drinking_mechanics()
        max_extra_shots = (
            max(0, team_size) * settings.max_extra_shots_per_member if has_drinking_mechanics else 0
        )
        capped_extra_shots = max(0, min(extra_shots, max_extra_shots))

        modifiers: dict[str, Any] = {
            "extra_shots": capped_extra_shots,
            "penalties": penalties or {},
        }
        if capped_extra_shots:
            modifiers["bonus_per_shot"] = settings.bonus_per_extra_shot
        final, raw = instance.apply_modifiers(base_score, modifiers)
        return ScoreBreakdown(final=final, raw=raw)

    async def _get_settings(self) -> RallySettings:
        """Get rally settings from database (cached for this service instance).

        The cached instance is dropped if the session expired it — a rollback
        expires every object in the session, and reading an attribute off an
        expired instance triggers a *synchronous* lazy refresh, which on an
        async session raises MissingGreenlet rather than reloading. This bites
        on the create-then-IntegrityError-then-update path, where the rollback
        happens between two reads of the settings.
        """
        if self._settings is not None and sa_inspect(self._settings).expired:
            self._settings = None
        if self._settings is None:
            stmt = select(RallySettings)
            self._settings = (await self.db.scalars(stmt)).first()
            if not self._settings:
                self._settings = RallySettings()
                self.db.add(self._settings)
                await self.db.flush()
        if self._settings is None:
            raise RallyError("Failed to get or create rally settings")
        return self._settings

    async def _has_drinking_mechanics(self) -> bool:
        """Whether shots and drinking penalties apply to the current event."""
        event_id = await current_event_id(self.db)
        event = await self.db.get(RallyEvent, event_id) if event_id is not None else None
        return (event.event_type if event else EventType.RALLY_TASCAS.value) != (
            EventType.PEDDY_PAPER.value
        )

    async def penalty_prices(
        self, activity: Activity, *, include_inactive: bool = False
    ) -> dict[str, float]:
        """Points deducted per occurrence, keyed by penalty key."""
        settings = await self._get_settings()
        prices: dict[str, float] = {}
        if await self._has_drinking_mechanics():
            prices["vomit"] = abs(float(settings.penalty_per_puke))
            prices["not_drinking"] = abs(float(settings.penalty_per_not_drinking))

        counters = (activity.config or {}).get("penalty_counters")
        if isinstance(counters, list):
            for counter in counters:
                if not isinstance(counter, dict):
                    continue
                key = counter.get("key")
                points = counter.get("points")
                if isinstance(key, str) and key and isinstance(points, int | float):
                    prices[key] = abs(float(points))

        event_id = await current_event_id(self.db)
        rule_filters: list[ColumnElement[bool]] = [
            (DynamicRule.event_id == event_id) | (DynamicRule.event_id.is_(None))
        ]
        if not include_inactive:
            rule_filters.append(DynamicRule.is_active.is_(True))
        rules = (await self.db.scalars(select(DynamicRule).where(*rule_filters))).all()
        for rule in rules:
            prices[f"g_{rule.id}"] = abs(float(rule.points))

        return prices

    async def resolve_penalty_points(
        self, activity: Activity, counts: dict[str, int], *, strict: bool = True
    ) -> dict[str, int]:
        """Price staff-entered occurrence counts into points to deduct."""
        if not counts:
            return {}

        prices = await self.penalty_prices(activity, include_inactive=not strict)
        unknown = sorted(key for key in counts if key not in prices)
        if unknown:
            if strict:
                raise RallyValidationError(f"Unknown penalty type(s): {', '.join(unknown)}")
            logger.warning(
                "Pricing orphaned penalty key(s) %s at 0 for activity %s "
                "(rule deleted/deactivated or removed from activity config)",
                ", ".join(unknown),
                activity.id,
            )

        points: dict[str, int] = {}
        for key, count in counts.items():
            if count is None:
                continue
            if count < 0:
                raise RallyValidationError(f"Penalty count for '{key}' cannot be negative")
            if count:
                points[key] = round(count * prices.get(key, 0.0))
        return points

    async def _checkpoint_scores_for_team(
        self, team_id: int
    ) -> tuple[dict[int, float], dict[int, int], float]:
        """Sum completed results per checkpoint, plus the raw total."""
        stmt = (
            select(ActivityResult)
            .options(joinedload(ActivityResult.activity).joinedload(Activity.checkpoint))
            .where(ActivityResult.team_id == team_id)
        )
        results = (await self.db.scalars(stmt)).all()

        checkpoint_scores: dict[int, float] = {}
        checkpoint_order_by_id: dict[int, int] = {}
        total_score = 0.0
        for result in results:
            if not (result.is_completed and result.final_score is not None):
                continue
            total_score += result.final_score
            if not (result.activity and result.activity.checkpoint):
                continue
            checkpoint = result.activity.checkpoint
            checkpoint_scores[checkpoint.id] = (
                checkpoint_scores.get(checkpoint.id, 0.0) + result.final_score
            )
            checkpoint_order_by_id[checkpoint.id] = checkpoint.order

        return checkpoint_scores, checkpoint_order_by_id, total_score

    async def _current_event_award_filter(self) -> Any:
        """WHERE clause restricting awards to the current edition."""
        event_id = await current_event_id(self.db)
        return (DynamicAward.event_id == event_id) | (DynamicAward.event_id.is_(None))

    async def _active_award_points(self, team_id: int) -> float:
        """Sum points from active dynamic awards for this team (D4)."""
        award_stmt = select(DynamicAward).where(
            DynamicAward.team_id == team_id,
            DynamicAward.is_active.is_(True),
            await self._current_event_award_filter(),
        )
        awards = (await self.db.scalars(award_stmt)).all()
        return sum(float(award.points) for award in awards)

    async def _reassign_team_ranks(self) -> None:
        """Re-rank every team from the totals currently in the session."""
        await team_crud.reassign_ranks_unlocked(self.db)

    async def _commit_and_publish_team_score(self, team_id: int, total_score: float) -> None:
        await self._commit_and_publish_team_scores({team_id: total_score})

    async def _commit_and_publish_team_scores(self, totals: dict[int, float]) -> None:
        """Re-rank, commit once, then publish one team.score_updated per team."""
        try:
            await self._reassign_team_ranks()
            await self.db.commit()
        except Exception as e:
            logger.exception("Failed to update team scores")
            raise RallyError(f"Failed to update team scores: {str(e)}") from e
        for team_id, total_score in sorted(totals.items()):
            await publish_event(
                TeamScoreUpdatedEvent(
                    payload=TeamScoreUpdatedPayload(team_id=team_id, total_score=total_score)
                )
            )

    async def _apply_team_score(self, team_id: int) -> float | None:
        """Recompute one team's total and checkpoint layout in the session."""
        await self.db.scalars(select(Team.id).order_by(Team.id).with_for_update())
        team = await self.db.get(Team, team_id)
        if not team:
            return None

        await self.db.flush()

        (
            checkpoint_scores,
            checkpoint_order_by_id,
            total_score,
        ) = await self._checkpoint_scores_for_team(team_id)
        total_score += await self._active_award_points(team_id)

        new_total = round(total_score)
        if new_total != team.total:
            team.last_scored_at = datetime.now(UTC)
        team.total = new_total

        self._apply_checkpoint_layout(
            team, checkpoint_scores, checkpoint_order_by_id, await self._route_orders()
        )
        return total_score

    async def update_team_scores(self, team_id: int, should_commit: bool = True) -> bool:
        """Update team's total and score_per_checkpoint based on activity results"""
        total_score = await self._apply_team_score(team_id)
        if total_score is None:
            return False

        if should_commit:
            await self._commit_and_publish_team_score(team_id, total_score)
        else:
            await self._reassign_team_ranks()
            await self.db.flush()

        return True

    async def recompute_and_commit_team_scores(self, team_ids: set[int]) -> None:
        """Atomically persist scores for several teams and publish afterwards.

        Always commits, even when ``team_ids`` is empty or no team resolves to a
        total: callers flush other work (e.g. an activity delete) into the same
        transaction and rely on this to make it durable.
        """
        totals: dict[int, float] = {}
        for team_id in sorted(team_ids):
            total = await self._apply_team_score(team_id)
            if total is not None:
                totals[team_id] = total
        if totals:
            await self._commit_and_publish_team_scores(totals)
        else:
            await self.db.commit()

    async def _route_orders(self) -> list[int]:
        """The published route's checkpoint orders, ascending."""
        return [cp.order for cp in await checkpoint_crud.get_all_ordered(self.db)]

    @staticmethod
    def _apply_checkpoint_layout(
        team: Team,
        checkpoint_scores: dict[int, float],
        checkpoint_order_by_id: dict[int, int],
        route_orders: Sequence[int],
    ) -> None:
        """Lay per-checkpoint scores onto ``team.score_per_checkpoint``."""
        pending: dict[int, list[int]] = {}
        for cid, score in checkpoint_scores.items():
            pending.setdefault(checkpoint_order_by_id[cid], []).append(round(score))

        layout: list[int] = []
        for order in route_orders:
            slot_scores = pending.get(order)
            layout.append(slot_scores.pop(0) if slot_scores else 0)
        team.score_per_checkpoint = layout

    async def update_all_team_scores(self, teams: list[Team]) -> None:
        """Recompute total + per-checkpoint scores for many teams in bulk."""
        if not teams:
            return

        await self.db.flush()
        team_ids = [team.id for team in teams]

        results_stmt = (
            select(ActivityResult)
            .options(joinedload(ActivityResult.activity).joinedload(Activity.checkpoint))
            .where(ActivityResult.team_id.in_(team_ids))
        )
        results = (await self.db.scalars(results_stmt)).all()

        awards_stmt = select(DynamicAward).where(
            DynamicAward.team_id.in_(team_ids),
            DynamicAward.is_active.is_(True),
            await self._current_event_award_filter(),
        )
        awards = (await self.db.scalars(awards_stmt)).all()

        per_team: dict[int, tuple[dict[int, float], dict[int, int], float]] = {
            tid: ({}, {}, 0.0) for tid in team_ids
        }
        for result in results:
            if not (result.is_completed and result.final_score is not None):
                continue
            bucket = per_team.get(result.team_id)
            if bucket is None:
                continue
            checkpoint_scores, checkpoint_order_by_id, running_total = bucket
            if result.activity and result.activity.checkpoint:
                checkpoint = result.activity.checkpoint
                checkpoint_scores[checkpoint.id] = (
                    checkpoint_scores.get(checkpoint.id, 0.0) + result.final_score
                )
                checkpoint_order_by_id[checkpoint.id] = checkpoint.order
            per_team[result.team_id] = (
                checkpoint_scores,
                checkpoint_order_by_id,
                running_total + result.final_score,
            )

        award_points_by_team: dict[int, float] = {}
        for award in awards:
            award_points_by_team[award.team_id] = award_points_by_team.get(
                award.team_id, 0.0
            ) + float(award.points)

        now = datetime.now(UTC)
        route_orders = await self._route_orders()
        for team in teams:
            checkpoint_scores, checkpoint_order_by_id, raw_total = per_team[team.id]
            total_score = raw_total + award_points_by_team.get(team.id, 0.0)
            new_total = round(total_score)
            if new_total != team.total:
                team.last_scored_at = now
            team.total = new_total
            self._apply_checkpoint_layout(
                team, checkpoint_scores, checkpoint_order_by_id, route_orders
            )

    async def _publish_result_change(
        self,
        event_cls: type[
            ActivityResultCreatedEvent | ActivityResultUpdatedEvent | ActivityResultDeletedEvent
        ],
        *,
        result_id: int,
        team_id: int,
        activity_id: int,
    ) -> None:
        """Emit an activity_result.* event after its write has committed."""
        await publish_event(
            self._result_change_event(
                event_cls, result_id=result_id, team_id=team_id, activity_id=activity_id
            )
        )

    async def apply_extra_shots_bonus(
        self,
        team_id: int,
        activity_id: int,
        extra_shots: int,
        *,
        editor: EvaluationEditor | None = None,
    ) -> bool:
        """Apply extra shots bonus to a team's activity result.

        The result mutation, audit row, excess-penalty award, team total and
        classification are one transaction in the synchronous path. In
        off-path mode the result is committed and an ``activity_result.updated``
        event is always published afterwards so the scoring worker can perform
        the deferred recompute.
        """
        await self._lock_activity_scoring(activity_id)

        team = await self.db.scalar(
            select(Team).options(selectinload(Team.members)).where(Team.id == team_id)
        )
        if not team:
            return False

        team_size = len(team.members) if team.members else 1

        settings = await self._get_settings()
        max_shots = team_size * settings.max_extra_shots_per_member
        if extra_shots > max_shots:
            return False

        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id, ActivityResult.team_id == team_id
        )
        result = (await self.db.scalars(stmt)).first()
        if not result:
            return False

        before = _snapshot_result(result) if editor is not None else None

        result.extra_shots = extra_shots
        await self._recalculate_result_score(result)

        if before is not None and editor is not None:
            self._queue_history(result, before, editor)

        totals: dict[int, float] = {}
        if not self._defer_recompute:
            total = await self._apply_team_score(team_id)
            if total is not None:
                totals[team_id] = total

        await self._commit_and_publish_team_scores(totals)
        await self._publish_result_change(
            ActivityResultUpdatedEvent,
            result_id=result.id,
            team_id=result.team_id,
            activity_id=result.activity_id,
        )
        return True

    async def apply_penalty(
        self,
        team_id: int,
        activity_id: int,
        penalty_type: str,
        penalty_count: int,
        *,
        editor: EvaluationEditor | None = None,
    ) -> bool:
        """Apply a penalty occurrence count to a team's activity result.

        The result mutation, audit row, excess-penalty award, team total and
        classification are one transaction in the synchronous path. In
        off-path mode the result is committed and an ``activity_result.updated``
        event is always published afterwards so the scoring worker can perform
        the deferred recompute.
        """
        await self._lock_activity_scoring(activity_id)

        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id, ActivityResult.team_id == team_id
        )
        result = (await self.db.scalars(stmt)).first()
        if not result:
            return False

        activity = await self.db.get(Activity, activity_id)
        if not activity:
            return False

        before = _snapshot_result(result) if editor is not None else None

        priced = await self.resolve_penalty_points(activity, {penalty_type: penalty_count})
        added_points = priced.get(penalty_type, 0)

        if penalty_type not in result.penalties:
            result.penalties[penalty_type] = 0
        result.penalties[penalty_type] += added_points
        result.penalty_counts = {
            **(result.penalty_counts or {}),
            penalty_type: (result.penalty_counts or {}).get(penalty_type, 0) + penalty_count,
        }

        await self._recalculate_result_score(result)

        if before is not None and editor is not None:
            self._queue_history(result, before, editor)

        totals: dict[int, float] = {}
        if not self._defer_recompute:
            total = await self._apply_team_score(team_id)
            if total is not None:
                totals[team_id] = total

        await self._commit_and_publish_team_scores(totals)
        await self._publish_result_change(
            ActivityResultUpdatedEvent,
            result_id=result.id,
            team_id=result.team_id,
            activity_id=result.activity_id,
        )
        return True

    async def _recalculate_result_score(self, result: ActivityResult) -> None:
        """Recalculate final_score for one result via the unified scorer, and
        sync its excess-penalty award."""
        activity = await self.db.get(Activity, result.activity_id)
        if not activity:
            return

        all_times = (
            await self._completed_times(activity.id)
            if activity.activity_type == ActivityType.TIME_BASED.value
            else None
        )

        breakdown = await self.compute_score_breakdown(
            activity_type=activity.activity_type,
            config=activity.config,
            result_data=result.result_data,
            team_size=await self._team_size(result.team_id),
            extra_shots=result.extra_shots,
            penalties=result.penalties,
            all_times=all_times,
        )
        result.final_score = breakdown.final
        await self._sync_excess_penalty_award(result, breakdown.raw, activity_name=activity.name)

    async def _sync_excess_penalty_award(
        self, result: ActivityResult, raw_score: float, *, activity_name: str
    ) -> None:
        """Keep a negative DynamicAward in step with a result whose penalties
        exceed its points."""
        existing = (
            await self.db.scalars(
                select(DynamicAward).where(DynamicAward.activity_result_id == result.id)
            )
        ).first()

        if raw_score >= 0:
            if existing is not None:
                await self.db.delete(existing)
            return

        shortfall = round(raw_score)
        reason = f"Penalização excedente: {activity_name}"[:256]
        if existing is not None:
            existing.points = shortfall
            existing.reason = reason
            existing.is_active = True
            return

        event_id = await current_event_id(self.db)
        self.db.add(
            DynamicAward(
                team_id=result.team_id,
                event_id=event_id,
                activity_result_id=result.id,
                points=shortfall,
                reason=reason,
                is_active=True,
            )
        )

    def _dialect_name(self) -> str:
        """Backend name of the bound engine ("postgresql", "sqlite", ...)."""
        try:
            return str(self.db.get_bind().dialect.name)
        except Exception:
            return ""

    async def _lock_activity_scoring(self, activity_id: int) -> None:
        """Serialize scoring of one activity for the rest of this transaction."""
        if self._dialect_name() != "postgresql":
            return
        await self.db.execute(
            select(func.pg_advisory_xact_lock(_ACTIVITY_SCORING_LOCK_NAMESPACE, activity_id))
        )

    def _set_activity_specific_scores(
        self, db_obj: ActivityResult, activity: Activity, result_data: dict[str, Any]
    ) -> None:
        """Set the type-specific score column(s) from result_data."""
        instance = ActivityFactory.create_activity(activity.activity_type, activity.config)
        for column, value in instance.persisted_score_fields(result_data).items():
            setattr(db_obj, column, value)

    async def create_result(
        self,
        obj_in: ActivityResultCreate,
        *,
        recalc: bool = True,
        update_team_scores: bool = True,
        commit: bool = True,
        sync_team_vs: bool = True,
    ) -> ActivityResult:
        """Validate, score and persist a new activity result.

        TeamVs writes are routed through ``create_team_vs_result`` so the two
        halves of the match are always one atomic unit, including the normal
        staff-evaluation path that calls this generic method.
        """
        activity = await self.db.get(Activity, obj_in.activity_id)
        if not activity:
            raise ValueError(f"Activity {obj_in.activity_id} not found")

        await self._lock_activity_scoring(activity.id)

        if sync_team_vs and activity.activity_type == ActivityType.TEAM_VS.value:
            opponent_id, winner_id, match_data = self._parse_team_vs_result_data(
                obj_in.team_id, obj_in.result_data
            )
            result, _ = await self.create_team_vs_result(
                obj_in.team_id,
                opponent_id,
                activity.id,
                winner_id,
                match_data,
                team1_extra_shots=obj_in.extra_shots,
                team1_penalties=obj_in.penalties,
                team1_penalty_counts=obj_in.penalty_counts,
                allow_update=False,
                commit=commit,
            )
            return result

        instance = ActivityFactory.create_activity(activity.activity_type, activity.config)
        if not await instance.validate_result(obj_in.result_data, obj_in.team_id, self.db):
            raise ValueError("Invalid result data for activity type")

        penalty_counts = obj_in.penalty_counts or {}
        penalties = (
            await self.resolve_penalty_points(activity, penalty_counts)
            if penalty_counts
            else obj_in.penalties
        )
        is_time_based = activity.activity_type == ActivityType.TIME_BASED.value
        completion_time = obj_in.result_data.get("completion_time_seconds")
        extra_time = float(completion_time) if completion_time is not None else None
        all_times = (
            await self._completed_times(obj_in.activity_id, extra_time=extra_time)
            if is_time_based
            else None
        )
        breakdown = await self.compute_score_breakdown(
            activity_type=activity.activity_type,
            config=activity.config,
            result_data=obj_in.result_data,
            team_size=await self._team_size(obj_in.team_id),
            extra_shots=obj_in.extra_shots,
            penalties=penalties,
            all_times=all_times,
        )

        db_obj = activity_result_crud.build(obj_in, breakdown.final)
        db_obj.penalties = dict(penalties)
        db_obj.penalty_counts = dict(penalty_counts)
        self._set_activity_specific_scores(db_obj, activity, obj_in.result_data)
        await activity_result_crud.persist(self.db, db_obj, commit=False)

        await self._sync_excess_penalty_award(db_obj, breakdown.raw, activity_name=activity.name)

        totals: dict[int, float] = {}
        if not self._defer_recompute:
            if recalc and is_time_based:
                totals.update(
                    await self._recalculate_all_results_for_activity(activity.id, commit=False)
                )
            if update_team_scores:
                total = await self._apply_team_score(obj_in.team_id)
                if total is not None:
                    totals[obj_in.team_id] = total

        if not commit:
            await self._reassign_team_ranks()
            await self.db.flush()
            for event in self._team_score_events(totals):
                self._stage_event(event)
            self._stage_event(
                self._result_change_event(
                    ActivityResultCreatedEvent,
                    result_id=db_obj.id,
                    team_id=db_obj.team_id,
                    activity_id=db_obj.activity_id,
                )
            )
            return db_obj

        await self._commit_and_publish_team_scores(totals)
        await self._publish_result_change(
            ActivityResultCreatedEvent,
            result_id=db_obj.id,
            team_id=db_obj.team_id,
            activity_id=db_obj.activity_id,
        )
        return db_obj

    async def _sync_team_vs_update(
        self,
        db_obj: ActivityResult,
        pending_update: dict[str, Any],
        *,
        editor: EvaluationEditor | None,
        commit: bool,
    ) -> ActivityResult | None:
        """Route a TeamVs outcome edit through the atomic pair primitive.

        Returns the resulting row when the edit was a match edit (including the
        no-op mirror re-write the legacy staff controller issues), or ``None``
        when ``db_obj`` is not a TeamVs result and the caller should fall
        through to the generic single-row update.
        """
        activity = await self.db.get(Activity, db_obj.activity_id)
        if activity is None or activity.activity_type != ActivityType.TEAM_VS.value:
            return None

        result_data = pending_update.get("result_data") or {}
        # The legacy staff controller still invokes its old mirror helper after
        # the generic write. Once the generic write has atomically synchronized
        # the pair, that mirror reaches the opponent with an identical
        # result_data-only update. Treat it as a true no-op so it cannot create
        # duplicate commits/events/history.
        if set(pending_update) == {"result_data"} and dict(db_obj.result_data or {}) == result_data:
            return db_obj

        opponent_id, winner_id, match_data = self._parse_team_vs_result_data(
            db_obj.team_id, result_data
        )
        result, _ = await self.create_team_vs_result(
            db_obj.team_id,
            opponent_id,
            db_obj.activity_id,
            winner_id,
            match_data,
            team1_extra_shots=pending_update.get("extra_shots"),
            team1_penalties=pending_update.get("penalties"),
            team1_penalty_counts=pending_update.get("penalty_counts"),
            editor=editor,
            allow_update=True,
            commit=commit,
        )
        return result

    async def update_result(
        self,
        db_obj: ActivityResult,
        obj_in: ActivityResultUpdate | ActivityResultStaffUpdate,
        *,
        editor: EvaluationEditor | None = None,
        commit: bool = True,
        sync_team_vs: bool = True,
    ) -> ActivityResult:
        """Apply an update to a result, rescoring when result_data changed.

        A TeamVs outcome edit is a match edit, not a single-row edit. Route it
        through the same atomic pair primitive before mutating either row.
        Modifier-only edits remain team-local because extra shots/penalties are
        not mirrored to the opponent.
        """
        await self._lock_activity_scoring(db_obj.activity_id)

        pending_update = obj_in.model_dump(exclude_unset=True)
        if sync_team_vs and "result_data" in pending_update:
            synced = await self._sync_team_vs_update(
                db_obj, pending_update, editor=editor, commit=commit
            )
            if synced is not None:
                return synced

        before = _snapshot_result(db_obj) if editor is not None else None
        update_data = activity_result_crud.apply_update(db_obj, obj_in)

        if "penalty_counts" in update_data:
            activity_for_pricing = await self.db.get(Activity, db_obj.activity_id)
            if activity_for_pricing is not None:
                db_obj.penalties = dict(
                    await self.resolve_penalty_points(
                        activity_for_pricing, db_obj.penalty_counts or {}, strict=False
                    )
                )
                update_data["penalties"] = db_obj.penalties

        scoring_fields = {"result_data", "extra_shots", "penalties", "penalty_counts"}
        totals: dict[int, float] = {}
        if scoring_fields & update_data.keys():
            activity = await self.db.get(Activity, db_obj.activity_id)
            if activity and "result_data" in update_data:
                self._set_activity_specific_scores(db_obj, activity, db_obj.result_data)

            await self._recalculate_result_score(db_obj)

            if (
                activity
                and activity.activity_type == ActivityType.TIME_BASED.value
                and "result_data" in update_data
                and not self._defer_recompute
            ):
                totals.update(
                    await self._recalculate_all_results_for_activity(activity.id, commit=False)
                )

        if before is not None and editor is not None:
            self._queue_history(db_obj, before, editor)

        await activity_result_crud.persist(self.db, db_obj, commit=False)

        if not self._defer_recompute:
            total = await self._apply_team_score(db_obj.team_id)
            if total is not None:
                totals[db_obj.team_id] = total
        if not commit:
            await self._stage_deferred_result_update(db_obj, totals)
            return db_obj

        await self._commit_and_publish_team_scores(totals)
        await self._publish_result_change(
            ActivityResultUpdatedEvent,
            result_id=db_obj.id,
            team_id=db_obj.team_id,
            activity_id=db_obj.activity_id,
        )
        return db_obj

    async def _stage_deferred_result_update(
        self, db_obj: ActivityResult, totals: dict[int, float]
    ) -> None:
        """Reassign ranks and queue score/result events for a ``commit=False`` update.

        The caller owns the commit, so the events wait in ``_staged_events``
        until it drains them via ``publish_staged_events``.
        """
        await self._reassign_team_ranks()
        await self.db.flush()
        for event in self._team_score_events(totals):
            self._stage_event(event)
        self._stage_event(
            self._result_change_event(
                ActivityResultUpdatedEvent,
                result_id=db_obj.id,
                team_id=db_obj.team_id,
                activity_id=db_obj.activity_id,
            )
        )

    def _queue_history(
        self,
        db_obj: ActivityResult,
        before: dict[str, Any],
        editor: EvaluationEditor,
    ) -> None:
        """Queue an UPDATED audit row when audited fields actually changed."""
        changes = _diff_snapshots(before, _snapshot_result(db_obj))
        if not changes:
            return
        self.db.add(
            EvaluationHistory(
                result_id=db_obj.id,
                action=EvaluationAction.UPDATED.value,
                editor_id=editor.id,
                editor_name=editor.name,
                changes=changes,
            )
        )

    async def remove_result(self, result_id: int) -> ActivityResult | None:
        """Delete a result and refresh the owning team's scores."""
        db_obj = await activity_result_crud.get(self.db, result_id)
        if db_obj is None:
            return None

        team_id = db_obj.team_id
        activity_id = db_obj.activity_id
        await self._lock_activity_scoring(activity_id)
        activity = await self.db.get(Activity, activity_id)
        is_time_based = (
            activity is not None and activity.activity_type == ActivityType.TIME_BASED.value
        )

        affected_team_ids = {team_id}
        if is_time_based:
            affected_team_ids |= set(
                (
                    await self.db.scalars(
                        select(ActivityResult.team_id).where(
                            ActivityResult.activity_id == activity_id
                        )
                    )
                ).all()
            )

        await activity_result_crud.delete(self.db, db_obj=db_obj, commit=False)
        totals: dict[int, float] = {}
        if not self._defer_recompute:
            if is_time_based:
                totals.update(
                    await self._recalculate_all_results_for_activity(activity_id, commit=False)
                )
            for affected_team_id in sorted(affected_team_ids):
                total = await self._apply_team_score(affected_team_id)
                if total is not None:
                    totals[affected_team_id] = total
        await self._commit_and_publish_team_scores(totals)
        await self._publish_result_change(
            ActivityResultDeletedEvent,
            result_id=result_id,
            team_id=team_id,
            activity_id=activity_id,
        )
        return db_obj

    async def _recalculate_all_results_for_activity(
        self, activity_id: int, *, commit: bool = True
    ) -> dict[int, float]:
        """Rescore every completed result of a time-based activity."""
        start = time.perf_counter()
        totals: dict[int, float] = {}
        with traced("scoring.recalculate_all_results_for_activity"):
            await self._lock_activity_scoring(activity_id)

            activity = await self.db.get(Activity, activity_id)
            if not activity or activity.activity_type != ActivityType.TIME_BASED.value:
                return totals

            stmt = select(ActivityResult).where(
                ActivityResult.activity_id == activity_id, ActivityResult.is_completed.is_(True)
            )

            all_results = list((await self.db.scalars(stmt)).all())
            if not all_results:
                return totals

            all_times = [float(r.time_score) for r in all_results if r.time_score is not None]

            team_size_cache: dict[int, int] = {}
            for result in all_results:
                if result.team_id not in team_size_cache:
                    team_size_cache[result.team_id] = await self._team_size(result.team_id)
                breakdown = await self.compute_score_breakdown(
                    activity_type=activity.activity_type,
                    config=activity.config,
                    result_data=result.result_data,
                    team_size=team_size_cache[result.team_id],
                    extra_shots=result.extra_shots,
                    penalties=result.penalties,
                    all_times=all_times,
                )
                result.final_score = breakdown.final
                await self._sync_excess_penalty_award(
                    result, breakdown.raw, activity_name=activity.name
                )

            for team_id in sorted({r.team_id for r in all_results}):
                total = await self._apply_team_score(team_id)
                if total is not None:
                    totals[team_id] = total

            if commit:
                await self._commit_and_publish_team_scores(totals)

        observe_scoring_recompute(time.perf_counter() - start)
        return totals

    async def reprice_all_results(self) -> int:
        """Re-run the scorer over every completed result of the current event."""
        event_id = await current_event_id(self.db)
        team_ids = list(
            (
                await self.db.scalars(
                    select(Team.id).where((Team.event_id == event_id) | (Team.event_id.is_(None)))
                )
            ).all()
        )
        if not team_ids:
            return 0

        activity_ids = sorted(
            (
                await self.db.scalars(
                    select(ActivityResult.activity_id)
                    .where(
                        ActivityResult.team_id.in_(team_ids),
                        ActivityResult.is_completed.is_(True),
                    )
                    .distinct()
                )
            ).all()
        )
        for activity_id in activity_ids:
            await self._lock_activity_scoring(activity_id)

        results = list(
            (
                await self.db.scalars(
                    select(ActivityResult).where(
                        ActivityResult.team_id.in_(team_ids),
                        ActivityResult.is_completed.is_(True),
                    )
                )
            ).all()
        )
        if not results:
            return 0

        by_activity: dict[int, list[ActivityResult]] = {}
        for result in results:
            by_activity.setdefault(result.activity_id, []).append(result)

        team_size_cache: dict[int, int] = {}
        repriced = 0
        for activity_id, activity_results in by_activity.items():
            activity = await self.db.get(Activity, activity_id)
            if activity is None:
                continue
            all_times = (
                [float(r.time_score) for r in activity_results if r.time_score is not None]
                if activity.activity_type == ActivityType.TIME_BASED.value
                else None
            )
            for result in activity_results:
                if result.team_id not in team_size_cache:
                    team_size_cache[result.team_id] = await self._team_size(result.team_id)
                if result.penalty_counts:
                    result.penalties = dict(
                        await self.resolve_penalty_points(
                            activity, result.penalty_counts, strict=False
                        )
                    )
                breakdown = await self.compute_score_breakdown(
                    activity_type=activity.activity_type,
                    config=activity.config,
                    result_data=result.result_data,
                    team_size=team_size_cache[result.team_id],
                    extra_shots=result.extra_shots,
                    penalties=result.penalties,
                    all_times=all_times,
                )
                result.final_score = breakdown.final
                await self._sync_excess_penalty_award(
                    result, breakdown.raw, activity_name=activity.name
                )
                repriced += 1

        return repriced

    async def _completed_counts_by_team(self) -> dict[int, int]:
        """Completed-activity count per team, in one grouped query (avoids N+1)."""
        count_stmt = (
            select(ActivityResult.team_id, func.count())
            .where(ActivityResult.is_completed.is_(True))
            .group_by(ActivityResult.team_id)
        )
        rows = (await self.db.execute(count_stmt)).all()
        return {row[0]: row[1] for row in rows}

    async def _get_activity_ranking(self, activity_id: int) -> list[dict[str, Any]]:
        """Rank teams by final_score for one activity ("1224" competition ranking)."""
        stmt = (
            select(ActivityResult)
            .options(joinedload(ActivityResult.team))
            .where(ActivityResult.activity_id == activity_id)
        )
        results = (await self.db.scalars(stmt)).all()
        results = sorted(
            results, key=lambda r: (r.final_score is not None, r.final_score or 0), reverse=True
        )

        completed_counts = await self._completed_counts_by_team()

        ranking = []
        prev_score: float | None = None
        rank = 0
        for i, result in enumerate(results, 1):
            if not result.team:
                continue
            score = float(result.final_score or 0)
            if prev_score is None or score != prev_score:
                rank = i
            prev_score = score
            ranking.append(
                {
                    "rank": rank,
                    "team_id": result.team.id,
                    "team_name": result.team.name,
                    "score": result.final_score or 0,
                    "activities_completed": completed_counts.get(result.team.id, 0),
                    "completed_at": result.completed_at,
                }
            )
        return ranking

    async def _get_global_ranking(self) -> list[dict[str, Any]]:
        """Global standings, read straight from the persisted columns."""
        event_id = await current_event_id(self.db)
        team_stmt = select(Team).where((Team.event_id == event_id) | (Team.event_id.is_(None)))
        teams: list[Team] = list((await self.db.scalars(team_stmt)).all())

        completed_counts = await self._completed_counts_by_team()

        ranking = [
            {
                "team_id": team.id,
                "team_name": team.name,
                "total_score": float(team.total),
                "activities_completed": completed_counts.get(team.id, 0),
                "rank": team.classification if team.classification > 0 else len(teams),
            }
            for team in teams
        ]
        ranking.sort(key=lambda r: (r["rank"], r["team_name"]))
        return ranking

    async def get_team_ranking(self, activity_id: int | None = None) -> list[dict[str, Any]]:
        """Get team ranking for specific activity or global ranking"""
        if activity_id:
            return await self._get_activity_ranking(activity_id)
        return await self._get_global_ranking()

    async def get_activity_statistics(self, activity_id: int) -> dict[str, Any]:
        """Get statistics for a specific activity"""
        stmt = select(ActivityResult).where(ActivityResult.activity_id == activity_id)
        results = (await self.db.scalars(stmt)).all()

        if not results:
            return {
                "total_participants": 0,
                "average_score": 0,
                "best_score": 0,
                "worst_score": 0,
                "completion_rate": 0,
            }

        completed_results = [r for r in results if r.is_completed and r.final_score is not None]
        scores = [float(r.final_score) for r in completed_results if r.final_score is not None]

        return {
            "total_participants": len(results),
            "completed_participants": len(completed_results),
            "average_score": sum(scores) / len(scores) if scores else 0.0,
            "best_score": max(scores) if scores else 0.0,
            "worst_score": min(scores) if scores else 0.0,
            "completion_rate": len(completed_results) / len(results) if results else 0.0,
        }

    @staticmethod
    def _parse_team_vs_result_data(
        team_id: int, result_data: dict[str, Any]
    ) -> tuple[int, int, dict[str, Any]]:
        """Translate one team's outcome payload into canonical match data."""
        opponent_id = result_data.get("opponent_team_id")
        outcome = result_data.get("result")
        if not isinstance(opponent_id, int) or opponent_id <= 0:
            raise RallyValidationError("Invalid TeamVs opponent")
        if outcome not in {"win", "lose", "draw"}:
            raise RallyValidationError("Invalid TeamVs result")

        winner_id = 0 if outcome == "draw" else (team_id if outcome == "win" else opponent_id)
        match_data = {
            key: value
            for key, value in result_data.items()
            if key not in {"result", "opponent_team_id"}
        }
        return opponent_id, winner_id, match_data

    async def validate_team_vs_match(
        self,
        team1_id: int,
        team2_id: int,
        activity_id: int,
        *,
        winner_id: int | None = None,
        allow_completed: bool = False,
    ) -> bool:
        """Validate a configured TeamVs match in the current edition.

        The legacy TeamVs endpoint reaches this service directly, so every
        invariant enforced by the Versus CRUD must also be enforced here:
        activity type/edition, exact configured pairing and a winner that is
        either one of the two teams or ``0`` (draw).
        """
        if team1_id == team2_id:
            return False

        activity = await self.db.get(Activity, activity_id)
        if activity is None or activity.activity_type != ActivityType.TEAM_VS.value:
            return False

        event_id = await current_event_id(self.db)
        if activity.event_id not in (None, event_id):
            return False

        team1 = await self.db.get(Team, team1_id)
        team2 = await self.db.get(Team, team2_id)
        if team1 is None or team2 is None:
            return False
        if team1.event_id not in (None, event_id) or team2.event_id not in (None, event_id):
            return False

        opponent = await versus.get_opponent(self.db, team_id=team1_id)
        if opponent is None or opponent.id != team2_id:
            return False

        if winner_id is not None and winner_id not in (0, team1_id, team2_id):
            return False

        if allow_completed:
            return True

        result1 = await activity_result_crud.get_by_activity_and_team(
            self.db, activity_id, team1_id
        )
        result2 = await activity_result_crud.get_by_activity_and_team(
            self.db, activity_id, team2_id
        )
        return not (
            (result1 is not None and result1.is_completed)
            or (result2 is not None and result2.is_completed)
        )

    async def _upsert_team_vs_half(
        self,
        *,
        activity_id: int,
        team_id: int,
        result_data: dict[str, Any],
        existing: ActivityResult | None,
        editor: EvaluationEditor | None,
        extra_shots: int | None = None,
        penalties: dict[str, int] | None = None,
        penalty_counts: dict[str, int] | None = None,
    ) -> tuple[type[ActivityResultCreatedEvent | ActivityResultUpdatedEvent], ActivityResult]:
        """Create or update one side of a TeamVs pair inside the caller's SAVEPOINT.

        Modifiers (extra shots / penalties) are only ever passed for team 1;
        team 2's half is always a plain outcome write.
        """
        if existing is None:
            create = ActivityResultCreate(
                activity_id=activity_id,
                team_id=team_id,
                result_data=result_data,
                extra_shots=extra_shots or 0,
                penalties=penalties or {},
                penalty_counts=penalty_counts,
            )
            result = await self.create_result(
                create,
                recalc=False,
                update_team_scores=False,
                commit=False,
                sync_team_vs=False,
            )
            return ActivityResultCreatedEvent, result

        fields: dict[str, Any] = {"result_data": result_data}
        if extra_shots is not None:
            fields["extra_shots"] = extra_shots
        if penalties is not None:
            fields["penalties"] = penalties
        if penalty_counts is not None:
            fields["penalty_counts"] = penalty_counts
        result = await self.update_result(
            existing,
            ActivityResultUpdate(**fields),
            editor=editor,
            commit=False,
            sync_team_vs=False,
        )
        return ActivityResultUpdatedEvent, result

    async def _settle_team_vs_events(
        self,
        result_events: Sequence[
            tuple[type[ActivityResultCreatedEvent | ActivityResultUpdatedEvent], ActivityResult]
        ],
        vs_totals: dict[int, float],
        *,
        commit: bool,
    ) -> None:
        """Commit (or, when ``commit=False``, stage) the pair's score/result events.

        With ``commit=False`` the caller owns the transaction, so events wait in
        ``_staged_events`` until it drains them via ``publish_staged_events``.
        """
        if not commit:
            for event in self._team_score_events(vs_totals):
                self._stage_event(event)
            for event_cls, db_obj in result_events:
                self._stage_event(
                    self._result_change_event(
                        event_cls,
                        result_id=db_obj.id,
                        team_id=db_obj.team_id,
                        activity_id=db_obj.activity_id,
                    )
                )
            return

        try:
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            logger.exception("Failed to commit team-vs results")
            raise

        for event in self._team_score_events(vs_totals):
            await publish_event(event)
        for event_cls, db_obj in result_events:
            await self._publish_result_change(
                event_cls,
                result_id=db_obj.id,
                team_id=db_obj.team_id,
                activity_id=db_obj.activity_id,
            )

    async def create_team_vs_result(
        self,
        team1_id: int,
        team2_id: int,
        activity_id: int,
        winner_id: int,
        match_data: dict[str, Any],
        *,
        team1_extra_shots: int | None = None,
        team1_penalties: dict[str, int] | None = None,
        team1_penalty_counts: dict[str, int] | None = None,
        editor: EvaluationEditor | None = None,
        allow_update: bool = False,
        commit: bool = True,
    ) -> tuple[ActivityResult, ActivityResult]:
        """Atomically create or update both halves of one TeamVs match.

        ``allow_update`` is used by the staff evaluation flow, where a POST can
        intentionally re-evaluate an existing result. The legacy endpoint keeps
        create-only semantics. With ``commit=False`` this method participates in
        the caller's transaction (for example the idempotency transaction) and
        never rolls it back or commits it.
        """
        if not await self.validate_team_vs_match(
            team1_id,
            team2_id,
            activity_id,
            winner_id=winner_id,
            allow_completed=allow_update,
        ):
            raise RallyValidationError("Teams cannot compete in this activity")

        def outcome_for(team_id: int) -> str:
            if winner_id == 0:
                return "draw"
            return "win" if winner_id == team_id else "lose"

        # Outcome and opponent are server-owned fields. Do not let legacy
        # ``match_data`` override either of them by dictionary merge order.
        safe_match_data = {
            key: value
            for key, value in (match_data or {}).items()
            if key not in {"result", "opponent_team_id"}
        }
        result1_data = {
            **safe_match_data,
            "result": outcome_for(team1_id),
            "opponent_team_id": team2_id,
        }
        result2_data = {
            **safe_match_data,
            "result": outcome_for(team2_id),
            "opponent_team_id": team1_id,
        }

        result_events: list[
            tuple[
                type[ActivityResultCreatedEvent | ActivityResultUpdatedEvent],
                ActivityResult,
            ]
        ] = []

        try:
            # A SAVEPOINT makes the pair all-or-nothing even when this method is
            # embedded in a larger transaction (notably idempotent staff writes).
            async with self.db.begin_nested():
                existing1 = await activity_result_crud.get_by_activity_and_team(
                    self.db, activity_id, team1_id
                )
                existing2 = await activity_result_crud.get_by_activity_and_team(
                    self.db, activity_id, team2_id
                )

                if (existing1 is not None or existing2 is not None) and not allow_update:
                    raise RallyValidationError("Teams cannot compete in this activity")

                event1, result1 = await self._upsert_team_vs_half(
                    activity_id=activity_id,
                    team_id=team1_id,
                    result_data=result1_data,
                    existing=existing1,
                    editor=editor,
                    extra_shots=team1_extra_shots,
                    penalties=team1_penalties,
                    penalty_counts=team1_penalty_counts,
                )
                result_events.append((event1, result1))

                event2, result2 = await self._upsert_team_vs_half(
                    activity_id=activity_id,
                    team_id=team2_id,
                    result_data=result2_data,
                    existing=existing2,
                    editor=editor,
                )
                result_events.append((event2, result2))

                # Both results must participate in the totals/ranking before the
                # transaction can become durable. No "mirror" is a later side
                # effect anymore.
                vs_totals: dict[int, float] = {}
                for vs_team_id in (team1_id, team2_id):
                    vs_total = await self._apply_team_score(vs_team_id)
                    if vs_total is not None:
                        vs_totals[vs_team_id] = vs_total
                await self._reassign_team_ranks()
                await self.db.flush()
        except Exception:
            logger.exception(
                "Failed to stage team-vs results for teams %s/%s activity %s",
                team1_id,
                team2_id,
                activity_id,
            )
            raise

        await self._settle_team_vs_events(result_events, vs_totals, commit=commit)
        return result1, result2
