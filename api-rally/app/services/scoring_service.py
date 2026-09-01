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
from app.events import (
    ActivityResultChangedPayload,
    ActivityResultCreatedEvent,
    ActivityResultDeletedEvent,
    ActivityResultUpdatedEvent,
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


# Scoring fields whose before/after we record when a result is edited. Kept
# explicit (not "every column") so timestamps and unrelated bookkeeping never
# show up as spurious diffs.
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


# Namespace for the per-activity advisory lock taken while scoring, so its
# keyspace can never collide with the other advisory locks this database takes
# (user mirroring, migrations).
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
                # Rank this time against every other team's time
                base_score = float(
                    instance.calculate_relative_ranking_score(all_times, float(this_time))
                )
            else:
                # Lone (or only completed) time-based result gets max points
                base_score = float(instance.config.get("max_points", 100))
        else:
            base_score = float(instance.calculate_score(result_data, team_size))

        # Server-side cap: the client validates extra_shots, but nothing stopped
        # an oversized value in the request body from inflating the score.
        settings = await self._get_settings()
        # a peddy-paper event has no drinking mechanics, extra shots
        # included — this used to apply the bonus unconditionally regardless
        # of event type (see penalty_prices for the matching penalty half).
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
                # Create default settings if none exist. Flush (not commit) so
                # callers batching writes into one atomic transaction
                # (commit=False paths) don't get a mid-transaction commit that
                # would persist their partial state.
                self._settings = RallySettings()
                self.db.add(self._settings)
                await self.db.flush()
        if self._settings is None:
            raise RallyError("Failed to get or create rally settings")
        return self._settings

    async def _has_drinking_mechanics(self) -> bool:
        """Whether shots and drinking penalties apply to the current event.


        mirrors web-rally's ``hasDrinkingMechanics`` (lib/eventTerms.ts),
        which only hid the UI for a ``peddy_paper`` event — the server priced
        and applied ``vomit``/``not_drinking``/extra-shot bonuses regardless.
        A forged request, a stale client cache, or an offline-queue entry
        created before the event type changed could still apply drinking
        mechanics to a peddy-paper event. Single source of truth here; the
        frontend check stays as the UI-hiding mirror it already documents
        itself as.
        """
        event_id = await current_event_id(self.db)
        event = await self.db.get(RallyEvent, event_id) if event_id is not None else None
        return (event.event_type if event else EventType.RALLY_TASCAS.value) != (
            EventType.PEDDY_PAPER.value
        )

    async def penalty_prices(
        self, activity: Activity, *, include_inactive: bool = False
    ) -> dict[str, float]:
        """Points deducted per occurrence, keyed by penalty key.

        The server's price list, assembled from the three places an admin can
        set one:

        * ``RallySettings.penalty_per_puke`` / ``penalty_per_not_drinking`` —
          the built-in drinking penalties;
        * ``Activity.config.penalty_counters`` — counters this activity
          defines for itself (``[{key, label, points}]``);
        * active ``DynamicRule`` rows — event-wide counters, exposed under the
          ``g_<id>`` key so they cannot collide with an activity's own.

        Magnitudes, always positive: the caller subtracts them.
        """
        settings = await self._get_settings()
        prices: dict[str, float] = {}
        # a peddy-paper event has no drinking mechanics — omit these keys
        # entirely so resolve_penalty_points rejects them as unknown instead
        # of silently pricing and applying them.
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

        # Same event scoping the admin list uses (DynamicScoringService.list_rules):
        # a past edition's counters must not price this edition's evaluations.
        # Legacy NULL event_id rows count as current.
        #
        # include_inactive=True is for repricing counts already persisted on a
        # result: a rule the admin soft-deleted mid-event must still be
        # reachable so existing g_<id> counts keep a price instead of an
        # unknown-key rejection (see resolve_penalty_points(strict=False)).
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
        """Price staff-entered occurrence counts into points to deduct.

        This is the boundary that makes penalties trustworthy. The client used
        to do this multiplication and send the finished points, so the request
        body named its own deduction: nothing stopped a forged or stale-priced
        value, and a client whose settings fetch had failed priced penalties
        from its own hardcoded fallbacks.

        With ``strict=True`` (the default, for counts fresh off a client
        request) an unknown key is rejected rather than passed through —
        passing it through is what let an arbitrary number reach the score.

        With ``strict=False`` (for repricing counts already persisted on a
        result) an unknown key — a global rule that was since deleted or
        deactivated, or a counter removed from the activity's own config —
        prices at 0 instead of raising. Rejecting here would turn a routine
        admin cleanup into a 500 on every future edit of that result and on
        the retroactive recompute (``reprice_all_results``); the caller still
        has the original count on the row if the price needs to be restored.
        """
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
        """Sum completed results per checkpoint, plus the raw total.

        Scores are keyed by the stable ``checkpoint.id`` (not the mutable
        ``checkpoint.order``): two checkpoints that transiently share an
        ``order`` mid-reorder must not collapse their scores into one slot.
        The returned ``id -> order`` map lets the caller lay the scores out in
        the checkpoints' current visit order.

        A global activity (``Activity.checkpoint_id`` is NULL, see D3) has no
        slot in that positional layout, but its points are still points: it
        counts toward ``total_score`` and is simply absent from
        ``checkpoint_scores``. Skipping the whole result — as this used to —
        made every global activity invisible in ``team.total``, and therefore
        on the leaderboard, which reads that column.
        """
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
            # Every scored result counts toward the total...
            total_score += result.final_score
            # ...but only a checkpoint-scoped one has a positional slot.
            if not (result.activity and result.activity.checkpoint):
                continue
            checkpoint = result.activity.checkpoint
            checkpoint_scores[checkpoint.id] = (
                checkpoint_scores.get(checkpoint.id, 0.0) + result.final_score
            )
            checkpoint_order_by_id[checkpoint.id] = checkpoint.order

        return checkpoint_scores, checkpoint_order_by_id, total_score

    async def _current_event_award_filter(self) -> Any:
        """WHERE clause restricting awards to the current edition.

        Legacy NULL ``event_id`` rows count as current (same rule teams use),
        so single-event data keeps working; awards stamped with a *past*
        event are excluded — a team carried into a new edition must not drag
        its old prizes and charges into the new standings.
        """
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
        """Re-rank every team from the totals currently in the session, so a
        classification is never left stale after a total changes. No score
        recompute; joins the caller's open transaction.
        """
        await team_crud.reassign_ranks_unlocked(self.db)

    async def _commit_and_publish_team_score(self, team_id: int, total_score: float) -> None:
        await self._commit_and_publish_team_scores({team_id: total_score})

    async def _commit_and_publish_team_scores(self, totals: dict[int, float]) -> None:
        """Re-rank, commit once, then publish one team.score_updated per team.

        One commit for the whole write rather than one per team: the write paths
        hold a per-activity advisory lock that Postgres releases at commit, so
        committing between the rescore and the team totals would drop the lock
        halfway through the very cycle it exists to protect.
        """
        try:
            await self._reassign_team_ranks()
            await self.db.commit()
        except Exception as e:
            logger.exception("Failed to update team scores")
            raise RallyError(f"Failed to update team scores: {str(e)}") from e
        # Publish after the commit so subscribers never see scores a
        # rollback would erase. No-op unless the realtime subsystem is on.
        # This is the single funnel for every leaderboard-affecting change.
        for team_id, total_score in sorted(totals.items()):
            await publish_event(
                TeamScoreUpdatedEvent(
                    payload=TeamScoreUpdatedPayload(team_id=team_id, total_score=total_score)
                )
            )

    async def _apply_team_score(self, team_id: int) -> float | None:
        """Recompute one team's total and checkpoint layout in the session.

        Returns the unrounded total, or None when the team no longer exists.
        Neither commits nor publishes: the caller decides when the write lands,
        which is what lets one transaction cover an activity-wide rescore plus
        every team total it moves.
        """
        # This is a read-modify-write of team.total, so it needs the row lock
        # before the read — two evaluations on the same team would otherwise
        # interleave and lose one update.
        #
        # The lock is taken over *all* teams ordered by id, not just this one,
        # to match reassign_ranks_unlocked (crud_team.get_multi(for_update=True),
        # ORDER BY Team.id), which this call reaches through the commit funnel.
        # Locking one row here and the whole table there gives two lock orders
        # and deadlocks: A holds team 5 and wants 2 while B holds 2 and wants 5.
        # One order for both, so they queue instead of deadlocking.
        #
        # Ordering against the per-activity lock: _lock_activity_scoring always
        # comes first (see its docstring), never the other way round.
        await self.db.scalars(select(Team.id).order_by(Team.id).with_for_update())
        team = await self.db.get(Team, team_id)
        if not team:
            return None

        (
            checkpoint_scores,
            checkpoint_order_by_id,
            total_score,
        ) = await self._checkpoint_scores_for_team(team_id)
        total_score += await self._active_award_points(team_id)

        # Update team scores (round, don't truncate: float sums like 99.999…
        # must not silently drop a point)
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
            # ``should_commit=False`` still means fully consistent in-session
            # state; its caller owns only the final commit/publication.
            await self._reassign_team_ranks()
            await self.db.flush()

        return True

    async def recompute_and_commit_team_scores(self, team_ids: set[int]) -> None:
        """Atomically persist scores for several teams and publish afterwards.

        Callers that mutate several source results in one transaction use this
        instead of committing each team independently.
        """
        totals: dict[int, float] = {}
        for team_id in sorted(team_ids):
            total = await self._apply_team_score(team_id)
            if total is not None:
                totals[team_id] = total
        if totals:
            await self._commit_and_publish_team_scores(totals)

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
        """Lay per-checkpoint scores onto ``team.score_per_checkpoint``.

        One slot per post on the route, in route order — so slot *i* is always
        the score of the *i*-th post, and a post that scored nothing holds a
        zero in its own slot.

        This used to be sized to ``len(team.times)`` and filled with only the
        posts that had points, padding the shortfall onto the *end*. Any post
        without a score therefore shifted every later one down a slot: a route
        of (no-activity, 10pts, 5pts) stored ``[10, 5, 0]`` instead of
        ``[0, 10, 5]``, and ``Team.last_checkpoint_score`` — which reads the
        last slot — reported 0. Three things append to ``team.times`` without
        producing points (the staff-eval "next post" pointer, a give-up, a
        no-activity check-in), so that shortfall was the normal case, not an
        edge one. The frontend has always indexed this array by post order,
        which is now what it actually is.

        Scores are keyed by the stable ``checkpoint.id`` upstream, so a reorder
        mid-event lands them in their new slots rather than smearing.
        """
        # round(), not int(): int() truncates toward zero, so a checkpoint at
        # 9.7 stored 9 while the total counted 9.7, and a -9.7 penalty stored
        # -9 (under-penalised). Rounding keeps sum(score_per_checkpoint) in step
        # with team.total.
        #
        # A reorder passes through a state where two checkpoints briefly share
        # an ``order``. Keying a plain dict by order would let one of them
        # overwrite the other and collapse both scores into a single slot, so
        # instead each score is consumed into the first route slot with a
        # matching order — two same-order checkpoints keep two distinct slots.
        pending: dict[int, list[int]] = {}
        for cid, score in checkpoint_scores.items():
            pending.setdefault(checkpoint_order_by_id[cid], []).append(round(score))

        layout: list[int] = []
        for order in route_orders:
            slot_scores = pending.get(order)
            layout.append(slot_scores.pop(0) if slot_scores else 0)
        team.score_per_checkpoint = layout

    async def update_all_team_scores(self, teams: list[Team]) -> None:
        """Recompute total + per-checkpoint scores for many teams in bulk.

        Avoids the N+1 the per-team ``update_team_scores`` incurs when called in
        a loop: instead of 2 queries per team (results + awards) it issues 2
        queries total, filtering by ``team_id IN (...)`` and grouping in Python.
        Mutates each team in place (same session identity); the caller commits.
        """
        if not teams:
            return

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

        # team_id -> (checkpoint_scores, checkpoint_order_by_id, raw_total)
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
            # Same rule as _checkpoint_scores_for_team: a global activity
            # (no checkpoint) still adds to the total, it just has no
            # positional slot in score_per_checkpoint.
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
        """Emit an activity_result.* event after its write has committed.

        Only call once the change is durable: subscribers (leaderboard now,
        badges later) must never react to a result a rollback would erase.
        No-op unless the realtime subsystem is enabled.
        """
        await publish_event(
            event_cls(
                payload=ActivityResultChangedPayload(
                    result_id=result_id, team_id=team_id, activity_id=activity_id
                )
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

        ``editor`` writes the same ``EvaluationHistory`` row ``update_result``
        does. This route changes ``final_score`` like any other edit, and used
        to leave no trail at all — an untracked way to rewrite a team's points
        that sat right next to the audited one.
        """
        # Rescoring reads this activity's time distribution and rewrites a
        # final_score on it, so it belongs to the same serialized unit as an
        # evaluation (see _lock_activity_scoring).
        await self._lock_activity_scoring(activity_id)

        # Get team size to validate limit
        team = await self.db.scalar(
            select(Team).options(selectinload(Team.members)).where(Team.id == team_id)
        )
        if not team:
            return False

        team_size = len(team.members) if team.members else 1

        # Validate extra shots limit (configurable per team member)
        settings = await self._get_settings()
        max_shots = team_size * settings.max_extra_shots_per_member
        if extra_shots > max_shots:
            return False

        # Get or create activity result
        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id, ActivityResult.team_id == team_id
        )
        result = (await self.db.scalars(stmt)).first()
        if not result:
            return False

        before = _snapshot_result(result) if editor is not None else None

        # Update extra shots
        result.extra_shots = extra_shots

        # Recalculate final score
        await self._recalculate_result_score(result)

        if before is not None and editor is not None:
            self._queue_history(result, before, editor)

        await self.db.commit()
        # final_score changed, so the team total must follow.
        if not self._defer_recompute:
            await self.update_team_scores(team_id)
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

        This used to write ``penalty_value`` straight into
        ``penalties`` as points, with no pricing and no key validation — a
        caller with ``UPDATE_ACTIVITY_RESULT`` (which a checkpoint staff has
        for their own checkpoint) could add arbitrary points via ``other``, a
        key ``penalty_prices`` never prices. ``penalty_count`` is now priced
        the same way every other penalty is (``resolve_penalty_points``), so
        an unknown ``penalty_type`` is rejected rather than accepted as free
        points.

        ``editor`` writes the same ``EvaluationHistory`` row ``update_result``
        does — this changes the team's points and must leave the same trail.
        """
        # Rescoring reads this activity's time distribution and rewrites a
        # final_score on it, so it belongs to the same serialized unit as an
        # evaluation (see _lock_activity_scoring).
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

        # Recalculate final score
        await self._recalculate_result_score(result)

        if before is not None and editor is not None:
            self._queue_history(result, before, editor)

        await self.db.commit()
        # final_score changed, so the team total must follow.
        if not self._defer_recompute:
            await self.update_team_scores(team_id)
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
        exceed its points.

        ``final_score`` is floored at 0 for the per-checkpoint display; the
        part below 0 (``raw_score``) is carried here as an award so it still
        subtracts from ``team.total``. Idempotent: one award per result, keyed
        on ``activity_result_id``; removed once ``raw_score >= 0``.

        ``result`` must already be persisted (``result.id`` set).
        """
        existing = (
            await self.db.scalars(
                select(DynamicAward).where(DynamicAward.activity_result_id == result.id)
            )
        ).first()

        if raw_score >= 0:
            if existing is not None:
                await self.db.delete(existing)
            return

        shortfall = round(raw_score)  # negative
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

    # =========================================================================
    # Activity-result orchestration
    #
    # These own the scoring/ranking/team-score side effects. They call the CRUD
    # layer for persistence only (build/persist/apply_update/delete), so the
    # dependency direction is Service -> CRUD and there is no import cycle.
    # =========================================================================

    def _dialect_name(self) -> str:
        """Backend name of the bound engine ("postgresql", "sqlite", ...)."""
        try:
            return str(self.db.get_bind().dialect.name)
        except Exception:  # pragma: no cover - unit tests pass mock sessions
            return ""

    async def _lock_activity_scoring(self, activity_id: int) -> None:
        """Serialize scoring of one activity for the rest of this transaction.

        A time-based score is a *relative* rank: a team's points depend on every
        other team's time (TimeBasedActivity.calculate_relative_ranking_score).
        Reading that distribution, scoring against it and writing the row is one
        read-modify-write over the whole activity, and two evaluations that
        interleave inside it each score as if the other did not exist. Nothing
        repairs the loser afterwards: every write's rescore pass only fixes the
        rows visible at that moment, so the last writer in the window keeps a
        rank computed from a set that was already stale - a wrong final ranking,
        with no error raised anywhere.

        Transaction-scoped: Postgres releases it at commit/rollback, so callers
        must hold ONE transaction across the whole read-compute-write cycle.
        That is why the write paths flush their steps and commit once at the
        end instead of committing per step.

        Lock ordering: always taken *before* the ORDER BY Team.id FOR UPDATE in
        _apply_team_score, never after, so concurrent writers queue instead of
        deadlocking.

        No-op outside Postgres - the sqlite test harness has no advisory locks
        and drives sessions serially anyway.
        """
        if self._dialect_name() != "postgresql":
            return
        await self.db.execute(
            select(func.pg_advisory_xact_lock(_ACTIVITY_SCORING_LOCK_NAMESPACE, activity_id))
        )

    def _set_activity_specific_scores(
        self, db_obj: ActivityResult, activity: Activity, result_data: dict[str, Any]
    ) -> None:
        """Set the type-specific score column(s) from result_data.

        Each activity type declares which ActivityResult column(s) it populates
        via persisted_score_fields, so adding a type needs no change here.
        """
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
    ) -> ActivityResult:
        """Validate, score and persist a new activity result.

        Pass commit=False to flush without committing, letting a caller batch
        this write with others into one atomic transaction.
        """
        activity = await self.db.get(Activity, obj_in.activity_id)
        if not activity:
            raise ValueError(f"Activity {obj_in.activity_id} not found")

        # Taken before the first read of the ranking inputs: everything from
        # here to the commit is one serialized unit for this activity.
        await self._lock_activity_scoring(activity.id)

        instance = ActivityFactory.create_activity(activity.activity_type, activity.config)
        if not await instance.validate_result(obj_in.result_data, obj_in.team_id, self.db):
            raise ValueError("Invalid result data for activity type")

        # Price the staff-entered counts server-side. When the caller sends
        # counts they are authoritative and the submitted `penalties` (points)
        # is ignored; legacy/admin callers that send only points still work.
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
        # Flush, never commit here: the row, its excess-penalty award, the
        # activity-wide rescore and every team total it moves belong to the one
        # transaction holding the activity lock, and commit together below.
        await activity_result_crud.persist(self.db, db_obj, commit=False)

        # Carry any penalty that overflowed this activity's points to team.total.
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
            # Batched caller owns only the final commit and post-commit events.
            # All scoring side effects above still have to run so the session
            # state it commits is already internally consistent.
            await self._reassign_team_ranks()
            await self.db.flush()
            return db_obj

        await self._commit_and_publish_team_scores(totals)
        await self._publish_result_change(
            ActivityResultCreatedEvent,
            result_id=db_obj.id,
            team_id=db_obj.team_id,
            activity_id=db_obj.activity_id,
        )

        return db_obj

    async def update_result(
        self,
        db_obj: ActivityResult,
        obj_in: ActivityResultUpdate | ActivityResultStaffUpdate,
        *,
        editor: EvaluationEditor | None = None,
        commit: bool = True,
    ) -> ActivityResult:
        """Apply an update to a result, rescoring when result_data changed.

        When ``editor`` is given, an ``EvaluationHistory`` row is appended with
        the field-level diff — the audit trail for who changed a score. No row
        is written when nothing actually changed.
        """
        # Everything from here to the single commit at the end is one
        # serialized unit for this activity (see _lock_activity_scoring).
        await self._lock_activity_scoring(db_obj.activity_id)

        before = _snapshot_result(db_obj) if editor is not None else None

        update_data = activity_result_crud.apply_update(db_obj, obj_in)

        # Re-price server-side whenever the staff-entered counts changed, so an
        # edit can never take a client-supplied point total either.
        #
        # strict=False: this edits an *already-recorded* result, whose payload
        # is normally the form re-submitting its own persisted counts rather
        # than freshly invented keys. A rule deleted/deactivated mid-event must
        # not turn every future edit of results that used it into a 500 (see
        # resolve_penalty_points).
        if "penalty_counts" in update_data:
            activity_for_pricing = await self.db.get(Activity, db_obj.activity_id)
            if activity_for_pricing is not None:
                db_obj.penalties = dict(
                    await self.resolve_penalty_points(
                        activity_for_pricing, db_obj.penalty_counts or {}, strict=False
                    )
                )
                update_data["penalties"] = db_obj.penalties

        # Any of these feed the scored total (base points, penalties, extra
        # shots), so an edit to any one must rescore the row and re-sync its
        # excess-penalty award — not just a result_data change.
        scoring_fields = {"result_data", "extra_shots", "penalties", "penalty_counts"}
        totals: dict[int, float] = {}
        if scoring_fields & update_data.keys():
            activity = await self.db.get(Activity, db_obj.activity_id)
            if activity and "result_data" in update_data:
                # Refresh the type-specific score column before rescoring; ranking
                # queries read it, so a stale time_score would skew the distribution.
                self._set_activity_specific_scores(db_obj, activity, db_obj.result_data)

            # Always rescore this row so it is never left stale; the activity-wide
            # rescore (rank shifts) is deferred to the worker when off-path.
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

        # Queue the audit row *before* persisting, so the single commit at the
        # end of this method covers both. Recording it afterwards needed a
        # commit of its own mid-flow, which split the write into two
        # transactions: a crash between them left the score changed with no
        # audit trail (or, when the recompute is deferred and no editor was
        # supplied, an audit row that never committed at all).
        if before is not None and editor is not None:
            self._queue_history(db_obj, before, editor)

        # Flush only — the row, the audit trail, the rescored rivals and the
        # team totals commit together below, while the activity lock still
        # covers them all.
        await activity_result_crud.persist(self.db, db_obj, commit=False)

        if not self._defer_recompute:
            total = await self._apply_team_score(db_obj.team_id)
            if total is not None:
                totals[db_obj.team_id] = total
        if not commit:
            await self._reassign_team_ranks()
            await self.db.flush()
            return db_obj

        await self._commit_and_publish_team_scores(totals)
        await self._publish_result_change(
            ActivityResultUpdatedEvent,
            result_id=db_obj.id,
            team_id=db_obj.team_id,
            activity_id=db_obj.activity_id,
        )
        return db_obj

    def _queue_history(
        self,
        db_obj: ActivityResult,
        before: dict[str, Any],
        editor: EvaluationEditor,
    ) -> None:
        """Queue an UPDATED audit row when audited fields actually changed.

        Adds to the session only — the caller's commit makes it durable
        together with the score change it describes.
        """
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

        # Capture identifiers before the row is gone.
        team_id = db_obj.team_id
        activity_id = db_obj.activity_id
        # Removing a time also re-ranks everyone else, so this delete is part of
        # the same serialized unit as any evaluation on the activity.
        await self._lock_activity_scoring(activity_id)
        activity = await self.db.get(Activity, activity_id)
        is_time_based = (
            activity is not None and activity.activity_type == ActivityType.TIME_BASED.value
        )
        # Whose totals this delete moves. For a time-based activity that is every
        # team with a result on it, not just this one: scores there are a
        # *relative* ranking of the times (see TimeBasedActivity.calculate_score),
        # so removing a time re-scores everyone else. create_result and
        # update_result already do this; deleting used to skip it, leaving every
        # rival's score stale unless the off-path scoring worker happened to be
        # running.
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

        # Flush the delete so the rescore below no longer sees this row, but
        # keep the transaction — and the activity lock — open to the end.
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
        """Rescore every completed result of a time-based activity.

        Called when the set of times changed (a result was added/edited/removed),
        since relative ranking depends on the full distribution of completion
        times. Every completed row is rescored, the caller's own included: a row
        left out here would keep whatever rank it was given when it was scored,
        which is exactly the stale value a concurrent write produces.

        Returns the unrounded total of each team this moved, keyed by team id,
        so a caller deferring the commit can publish them once it lands.

        Pass commit=False to defer persistence to the caller, so this rescore
        can be batched into a single atomic transaction.
        """
        start = time.perf_counter()
        totals: dict[int, float] = {}
        with traced("scoring.recalculate_all_results_for_activity"):
            # Serialize against any other write scoring this activity. The write
            # paths already hold it and re-enter harmlessly; the scoring worker
            # calls in here without one.
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

            # `is not None`, not truthiness: a 0.0 time must still rank.
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
        """Re-run the scorer over every completed result of the current event.

        This is what makes an admin scoring change retroactive. Everything
        else in this service rescores only the rows touched by the write that
        triggered it, so a change to RallySettings (``bonus_per_extra_shot``,
        the penalty prices) or to a ``DynamicRule`` price would otherwise never
        reach results that were already scored — the admin could edit a value
        and watch the standings not move.

        Does not commit: the caller pairs this with the classification pass so
        the whole re-price lands in one transaction. Returns how many results
        were rescored.
        """
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

        # Lock every activity this pass will rescore, ascending, *before*
        # reading the times. Without it a concurrent evaluation can commit
        # between this read and the rescore below, and have its result
        # overwritten with a rank computed as if it never happened. Ascending
        # order matches the single-activity write paths, so the two queue
        # rather than deadlock.
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
            # A time-based score is a rank within the activity, so the whole
            # set of times has to be in hand before any single row is scored.
            all_times = (
                [float(r.time_score) for r in activity_results if r.time_score is not None]
                if activity.activity_type == ActivityType.TIME_BASED.value
                else None
            )
            for result in activity_results:
                if result.team_id not in team_size_cache:
                    team_size_cache[result.team_id] = await self._team_size(result.team_id)
                # Re-price the recorded counts at today's rates. This is the
                # half that makes a changed penalty price retroactive; results
                # with no stored counts (pre-migration rows, admin-set points)
                # keep the points they already have.
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
        """Global standings, read straight from the persisted columns.

        The single source of truth is ``Team.total`` and ``Team.classification``,
        maintained by ``update_team_scores`` + ``assign_ranks`` on every scoring
        event. This method used to recompute the total from raw results here,
        which drifted from ``Team.total`` (rounding, event scope, activities
        with no checkpoint) and applied a *different* tie policy. It no longer
        recomputes anything — it just projects the stored ranking, scoped to
        the current edition so past editions never leak onto the public board.
        """
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
                # Stored rank is authoritative. 0 == unranked: sort it last.
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

    async def validate_team_vs_match(self, team1_id: int, team2_id: int, activity_id: int) -> bool:
        """Validate that two teams can compete in a team vs team activity"""
        # Check if both teams exist
        team1 = await self.db.get(Team, team1_id)
        team2 = await self.db.get(Team, team2_id)

        if not team1 or not team2:
            return False

        # Check if teams already have results for this activity
        stmt1 = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id, ActivityResult.team_id == team1_id
        )
        result1 = (await self.db.scalars(stmt1)).first()

        stmt2 = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id, ActivityResult.team_id == team2_id
        )
        result2 = (await self.db.scalars(stmt2)).first()

        if result1 and result1.is_completed:
            return False

        return not (result2 and result2.is_completed)

    async def create_team_vs_result(
        self,
        team1_id: int,
        team2_id: int,
        activity_id: int,
        winner_id: int,
        match_data: dict[str, Any],
    ) -> tuple[ActivityResult, ActivityResult]:
        """Create results for both teams in a team vs team activity.

        Returns the two persisted results. Raises RallyValidationError if the
        teams cannot compete; any unexpected failure is rolled back and
        re-raised (never swallowed into a misleading return value).
        """
        if not await self.validate_team_vs_match(team1_id, team2_id, activity_id):
            raise RallyValidationError("Teams cannot compete in this activity")

        # Determine results
        def outcome_for(team_id: int) -> str:
            if winner_id == team_id:
                return "win"
            return "draw" if winner_id == 0 else "lose"

        team1_result = outcome_for(team1_id)
        team2_result = outcome_for(team2_id)

        # Create result for team 1
        result1_data = {"result": team1_result, "opponent_team_id": team2_id, **match_data}

        # Create result for team 2
        result2_data = {"result": team2_result, "opponent_team_id": team1_id, **match_data}

        try:
            # Create both results

            result1_create = ActivityResultCreate(
                activity_id=activity_id, team_id=team1_id, result_data=result1_data
            )

            result2_create = ActivityResultCreate(
                activity_id=activity_id, team_id=team2_id, result_data=result2_data
            )

            # Use datetime.now(timezone.utc) instead of func.now() for proper datetime value
            current_time = datetime.now(UTC)

            # Persist both results without committing so the whole match lands
            # in one transaction (a half-recorded head-to-head is invalid).
            result1_db_obj = await self.create_result(
                result1_create, recalc=False, update_team_scores=False, commit=False
            )
            result2_db_obj = await self.create_result(
                result2_create, recalc=False, update_team_scores=False, commit=False
            )

            # Mark as completed
            result1_db_obj.is_completed = True
            result1_db_obj.completed_at = current_time
            result2_db_obj.is_completed = True
            result2_db_obj.completed_at = current_time

            # Recalculate the activity and both teams' scores, still deferring the
            # commit so everything persists atomically below.
            await self._recalculate_all_results_for_activity(activity_id, commit=False)
            await self.update_team_scores(team1_id, should_commit=False)
            await self.update_team_scores(team2_id, should_commit=False)
            # Both totals moved with should_commit=False, so the rank recompute
            # in the commit funnel was skipped — do it once here before the
            # single atomic commit.
            await self._reassign_team_ranks()
            # Single commit: either the full match persists or nothing does.
            await self.db.commit()

            # Both results were persisted with commit=False, so neither emitted
            # its own event. Publish now (post-commit) so the leaderboard and
            # future badge consumers see the completed head-to-head.
            for db_obj in (result1_db_obj, result2_db_obj):
                await self._publish_result_change(
                    ActivityResultCreatedEvent,
                    result_id=db_obj.id,
                    team_id=db_obj.team_id,
                    activity_id=db_obj.activity_id,
                )

            return result1_db_obj, result2_db_obj

        except RallyError:
            await self.db.rollback()
            raise
        except Exception:
            await self.db.rollback()
            logger.exception("Failed to create team vs team results")
            raise
