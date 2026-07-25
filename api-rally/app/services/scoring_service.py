"""
Scoring system service for Rally activities
"""

import copy
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.config import get_settings
from app.core.exceptions import RallyError, RallyValidationError
from app.crud.crud_activity import activity_result as activity_result_crud
from app.events import (
    ActivityResultChangedPayload,
    ActivityResultCreatedEvent,
    ActivityResultDeletedEvent,
    ActivityResultUpdatedEvent,
    TeamScoreUpdatedEvent,
    TeamScoreUpdatedPayload,
    publish_event,
)
from app.models.activity import Activity, ActivityResult
from app.models.activity_factory import ActivityFactory
from app.models.dynamic_scoring import DynamicAward
from app.models.evaluation_history import EvaluationAction, EvaluationHistory
from app.models.rally_settings import RallySettings
from app.models.team import Team
from app.schemas.activity import ActivityResultCreate, ActivityResultUpdate
from app.schemas.activity_types import ActivityType

logger = logging.getLogger(__name__)


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


def _snapshot_result(result: ActivityResult) -> dict[str, Any]:
    """Deep-copy the audited fields of a result for later diffing."""
    return {field: copy.deepcopy(getattr(result, field)) for field in _AUDITED_FIELDS}


def _diff_snapshots(before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Field-level {field: {"before", "after"}} for values that changed."""
    return {
        field: {"before": before[field], "after": after[field]}
        for field in _AUDITED_FIELDS
        if before.get(field) != after.get(field)
    }


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
        """Single source of truth for scoring a result.

        For time-based games, pass all_times (full set to rank against, including this results own time)
        to use relative ranking; otherwise, base scoring.
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

        modifiers: dict[str, Any] = {"extra_shots": extra_shots, "penalties": penalties or {}}
        if extra_shots:
            modifiers["bonus_per_shot"] = (await self._get_settings()).bonus_per_extra_shot
        return float(instance.apply_modifiers(base_score, modifiers))

    async def _get_settings(self) -> RallySettings:
        """Get rally settings from database (cached)"""
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

    async def calculate_team_total_score(self, team_id: int) -> float:
        """Calculate total score for a team including all modifiers"""
        stmt = select(ActivityResult).where(ActivityResult.team_id == team_id)
        results = (await self.db.scalars(stmt)).all()
        total_score = 0.0

        for result in results:
            if result.is_completed and result.final_score is not None:
                total_score += float(result.final_score)

        return total_score

    async def _checkpoint_scores_for_team(
        self, team_id: int
    ) -> tuple[dict[int, float], dict[int, int], float]:
        """Sum completed results per checkpoint, plus the raw total.

        Scores are keyed by the stable ``checkpoint.id`` (not the mutable
        ``checkpoint.order``): two checkpoints that transiently share an
        ``order`` mid-reorder must not collapse their scores into one slot.
        The returned ``id -> order`` map lets the caller lay the scores out in
        the checkpoints' current visit order.
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
            if not (result.activity and result.activity.checkpoint):
                continue
            checkpoint = result.activity.checkpoint
            checkpoint_scores[checkpoint.id] = (
                checkpoint_scores.get(checkpoint.id, 0.0) + result.final_score
            )
            checkpoint_order_by_id[checkpoint.id] = checkpoint.order
            total_score += result.final_score

        return checkpoint_scores, checkpoint_order_by_id, total_score

    async def _active_award_points(self, team_id: int) -> float:
        """Sum points from active dynamic awards for this team (D4)."""
        award_stmt = select(DynamicAward).where(
            DynamicAward.team_id == team_id,
            DynamicAward.is_active.is_(True),
        )
        awards = (await self.db.scalars(award_stmt)).all()
        return sum(float(award.points) for award in awards)

    async def _commit_and_publish_team_score(self, team_id: int, total_score: float) -> None:
        try:
            await self.db.commit()
        except Exception as e:
            logger.exception("Failed to update team scores")
            raise RallyError(f"Failed to update team scores: {str(e)}")
        # Publish after the commit so subscribers never see scores a
        # rollback would erase. No-op unless the realtime subsystem is on.
        # This is the single funnel for every leaderboard-affecting change.
        await publish_event(
            TeamScoreUpdatedEvent(
                payload=TeamScoreUpdatedPayload(team_id=team_id, total_score=total_score)
            )
        )

    async def update_team_scores(self, team_id: int, should_commit: bool = True) -> bool:
        """Update team's total and score_per_checkpoint based on activity results"""
        team = await self.db.get(Team, team_id)
        if not team:
            return False

        (
            checkpoint_scores,
            checkpoint_order_by_id,
            total_score,
        ) = await self._checkpoint_scores_for_team(team_id)
        total_score += await self._active_award_points(team_id)

        # Update team scores (round, don't truncate: float sums like 99.999…
        # must not silently drop a point)
        team.total = round(total_score)

        # score_per_checkpoint is positional and parallel to team.times (visit
        # order == checkpoint order). Lay the per-checkpoint scores out by the
        # checkpoints' *current* order, sized to the number of visits, so the
        # last slot stays the last-visited checkpoint's score for `[-1]`
        # consumers. Keying the aggregation by id (above) keeps this correct
        # even if orders shift during a reorder.
        self._apply_checkpoint_layout(team, checkpoint_scores, checkpoint_order_by_id)

        if should_commit:
            await self._commit_and_publish_team_score(team_id, total_score)

        return True

    def _apply_checkpoint_layout(
        self,
        team: Team,
        checkpoint_scores: dict[int, float],
        checkpoint_order_by_id: dict[int, int],
    ) -> None:
        """Lay per-checkpoint scores onto ``team.score_per_checkpoint``.

        Extracted from ``update_team_scores`` so the batch path shares the exact
        same positional layout (visit order == checkpoint order, sized to
        ``team.times``).
        """
        scores_by_order = sorted(
            (checkpoint_order_by_id[cid], score) for cid, score in checkpoint_scores.items()
        )
        ordered_scores = [int(score) for _order, score in scores_by_order]
        num_visits = len(team.times)
        team.score_per_checkpoint = (
            ordered_scores[:num_visits] + [0] * (num_visits - len(ordered_scores))
        )[:num_visits]

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
        )
        awards = (await self.db.scalars(awards_stmt)).all()

        # team_id -> (checkpoint_scores, checkpoint_order_by_id, raw_total)
        per_team: dict[int, tuple[dict[int, float], dict[int, int], float]] = {
            tid: ({}, {}, 0.0) for tid in team_ids
        }
        for result in results:
            if not (result.is_completed and result.final_score is not None):
                continue
            if not (result.activity and result.activity.checkpoint):
                continue
            bucket = per_team.get(result.team_id)
            if bucket is None:
                continue
            checkpoint_scores, checkpoint_order_by_id, _ = bucket
            checkpoint = result.activity.checkpoint
            checkpoint_scores[checkpoint.id] = (
                checkpoint_scores.get(checkpoint.id, 0.0) + result.final_score
            )
            checkpoint_order_by_id[checkpoint.id] = checkpoint.order
            per_team[result.team_id] = (
                checkpoint_scores,
                checkpoint_order_by_id,
                bucket[2] + result.final_score,
            )

        award_points_by_team: dict[int, float] = {}
        for award in awards:
            award_points_by_team[award.team_id] = award_points_by_team.get(
                award.team_id, 0.0
            ) + float(award.points)

        for team in teams:
            checkpoint_scores, checkpoint_order_by_id, raw_total = per_team[team.id]
            total_score = raw_total + award_points_by_team.get(team.id, 0.0)
            team.total = round(total_score)
            self._apply_checkpoint_layout(team, checkpoint_scores, checkpoint_order_by_id)

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
        self, team_id: int, activity_id: int, extra_shots: int
    ) -> bool:
        """Apply extra shots bonus to a team's activity result"""
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

        # Update extra shots
        result.extra_shots = extra_shots

        # Recalculate final score
        await self._recalculate_result_score(result)

        await self.db.commit()
        # final_score changed, so the team total must follow.
        if not self._defer_recompute:
            await self.update_team_scores(team_id)
        return True

    async def apply_penalty(
        self, team_id: int, activity_id: int, penalty_type: str, penalty_value: int
    ) -> bool:
        """Apply penalty to a team's activity result"""
        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id, ActivityResult.team_id == team_id
        )
        result = (await self.db.scalars(stmt)).first()
        if not result:
            return False

        # Add penalty to penalties dict
        if penalty_type not in result.penalties:
            result.penalties[penalty_type] = 0
        result.penalties[penalty_type] += penalty_value

        # Recalculate final score
        await self._recalculate_result_score(result)

        await self.db.commit()
        # final_score changed, so the team total must follow.
        if not self._defer_recompute:
            await self.update_team_scores(team_id)
        return True

    async def apply_vomit_penalty(self, team_id: int, activity_id: int) -> bool:
        """Apply vomit penalty (configurable points)"""
        settings = await self._get_settings()
        return await self.apply_penalty(
            team_id, activity_id, "vomit", abs(settings.penalty_per_puke)
        )

    async def apply_drink_penalty(
        self, team_id: int, activity_id: int, participants_not_drinking: int
    ) -> bool:
        """Apply penalty for not drinking (configurable points per participant)"""
        settings = await self._get_settings()
        penalty_value = participants_not_drinking * abs(settings.penalty_per_not_drinking)
        return await self.apply_penalty(team_id, activity_id, "not_drinking", penalty_value)

    async def _recalculate_result_score(self, result: ActivityResult) -> None:
        """Recalculate final_score for one result via the unified scorer."""
        activity = await self.db.get(Activity, result.activity_id)
        if not activity:
            return

        all_times = (
            await self._completed_times(activity.id)
            if activity.activity_type == ActivityType.TIME_BASED.value
            else None
        )

        result.final_score = await self.compute_final_score(
            activity_type=activity.activity_type,
            config=activity.config,
            result_data=result.result_data,
            team_size=await self._team_size(result.team_id),
            extra_shots=result.extra_shots,
            penalties=result.penalties,
            all_times=all_times,
        )

    # =========================================================================
    # Activity-result orchestration
    #
    # These own the scoring/ranking/team-score side effects. They call the CRUD
    # layer for persistence only (build/persist/apply_update/delete), so the
    # dependency direction is Service -> CRUD and there is no import cycle.
    # =========================================================================

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

        instance = ActivityFactory.create_activity(activity.activity_type, activity.config)
        if not await instance.validate_result(obj_in.result_data, obj_in.team_id, self.db):
            raise ValueError("Invalid result data for activity type")

        is_time_based = activity.activity_type == ActivityType.TIME_BASED.value
        completion_time = obj_in.result_data.get("completion_time_seconds")
        extra_time = float(completion_time) if completion_time is not None else None
        all_times = (
            await self._completed_times(obj_in.activity_id, extra_time=extra_time)
            if is_time_based
            else None
        )
        final_score = await self.compute_final_score(
            activity_type=activity.activity_type,
            config=activity.config,
            result_data=obj_in.result_data,
            team_size=await self._team_size(obj_in.team_id),
            extra_shots=obj_in.extra_shots,
            penalties=obj_in.penalties,
            all_times=all_times,
        )

        db_obj = activity_result_crud.build(obj_in, final_score)
        self._set_activity_specific_scores(db_obj, activity, obj_in.result_data)
        await activity_result_crud.persist(self.db, db_obj, commit=commit)

        # Adding a time-based result shifts the ranking, so rescore the rest.
        # When recompute is deferred, the scoring worker does this off-path;
        # the row keeps its own freshly-computed final_score in the meantime.
        if recalc and is_time_based and not self._defer_recompute:
            await self._recalculate_all_results_for_activity(
                activity.id, exclude_result_id=db_obj.id
            )

        if update_team_scores and not self._defer_recompute:
            await self.update_team_scores(obj_in.team_id)

        # Granular event only when this call owns the commit. Batched callers
        # (commit=False, e.g. team-vs) publish once after their own commit.
        if commit:
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
        obj_in: ActivityResultUpdate,
        *,
        editor: EvaluationEditor | None = None,
    ) -> ActivityResult:
        """Apply an update to a result, rescoring when result_data changed.

        When ``editor`` is given, an ``EvaluationHistory`` row is appended with
        the field-level diff — the audit trail for who changed a score. No row
        is written when nothing actually changed.
        """
        before = _snapshot_result(db_obj) if editor is not None else None

        update_data = activity_result_crud.apply_update(db_obj, obj_in)

        if "result_data" in update_data:
            activity = await self.db.get(Activity, db_obj.activity_id)
            if activity:
                # Refresh the type-specific score column before rescoring; ranking
                # queries read it, so a stale time_score would skew the distribution.
                self._set_activity_specific_scores(db_obj, activity, db_obj.result_data)

            # Always rescore this row so it is never left stale; the activity-wide
            # rescore (rank shifts) is deferred to the worker when off-path.
            await self._recalculate_result_score(db_obj)

            if (
                activity
                and activity.activity_type == ActivityType.TIME_BASED.value
                and not self._defer_recompute
            ):
                await self._recalculate_all_results_for_activity(activity.id)

        await activity_result_crud.persist(self.db, db_obj)

        if before is not None and editor is not None:
            await self._record_history(db_obj, before, editor)

        if not self._defer_recompute:
            await self.update_team_scores(db_obj.team_id)
        await self._publish_result_change(
            ActivityResultUpdatedEvent,
            result_id=db_obj.id,
            team_id=db_obj.team_id,
            activity_id=db_obj.activity_id,
        )
        return db_obj

    async def _record_history(
        self,
        db_obj: ActivityResult,
        before: dict[str, Any],
        editor: EvaluationEditor,
    ) -> None:
        """Append an UPDATED audit row when audited fields actually changed."""
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
        await self.db.commit()

    async def remove_result(self, result_id: int) -> ActivityResult | None:
        """Delete a result and refresh the owning team's scores."""
        db_obj = await activity_result_crud.get(self.db, result_id)
        if db_obj is None:
            return None

        # Capture identifiers before the row is gone.
        team_id = db_obj.team_id
        activity_id = db_obj.activity_id
        await activity_result_crud.delete(self.db, db_obj=db_obj)
        if not self._defer_recompute:
            await self.update_team_scores(team_id)
        await self._publish_result_change(
            ActivityResultDeletedEvent,
            result_id=result_id,
            team_id=team_id,
            activity_id=activity_id,
        )
        return db_obj

    async def _recalculate_all_results_for_activity(
        self, activity_id: int, exclude_result_id: int | None = None, *, commit: bool = True
    ) -> None:
        """Rescore every completed result of a time-based activity.

        Called when the set of times changed (a result was added/edited), since
        relative ranking depends on the full distribution of completion times.

        Pass commit=False to defer persistence to the caller, so this rescore
        can be batched into a single atomic transaction.
        """
        activity = await self.db.get(Activity, activity_id)
        if not activity or activity.activity_type != ActivityType.TIME_BASED.value:
            return

        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id, ActivityResult.is_completed.is_(True)
        )
        if exclude_result_id is not None:
            stmt = stmt.where(ActivityResult.id != exclude_result_id)

        all_results = list((await self.db.scalars(stmt)).all())
        if not all_results:
            return

        all_times = [float(r.time_score) for r in all_results if r.time_score is not None]
        if exclude_result_id is not None:
            excluded = await self.db.get(ActivityResult, exclude_result_id)
            # `is not None`, not truthiness: a 0.0 time must still rank.
            if excluded and excluded.time_score is not None:
                all_times.append(float(excluded.time_score))

        team_size_cache: dict[int, int] = {}
        for result in all_results:
            if result.team_id not in team_size_cache:
                team_size_cache[result.team_id] = await self._team_size(result.team_id)
            result.final_score = await self.compute_final_score(
                activity_type=activity.activity_type,
                config=activity.config,
                result_data=result.result_data,
                team_size=team_size_cache[result.team_id],
                extra_shots=result.extra_shots,
                penalties=result.penalties,
                all_times=all_times,
            )

        if commit:
            await self.db.commit()
        for team_id in {r.team_id for r in all_results}:
            await self.update_team_scores(team_id, should_commit=commit)

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

    @staticmethod
    def _ranking_score(item: dict[str, Any]) -> float:
        score = item.get("total_score", 0)
        return float(score) if score is not None else 0.0

    async def _get_global_ranking(self) -> list[dict[str, Any]]:
        """Rank teams by total score across all activities ("1224" ranking)."""
        team_stmt = select(Team).options(selectinload(Team.activity_results))
        teams: list[Team] = list((await self.db.scalars(team_stmt)).all())

        ranking = []
        for team in teams:
            # activity_results are eager-loaded via selectinload above; compute
            # the total from them instead of a per-team query (avoids N+1).
            completed = [r for r in team.activity_results if r.is_completed]
            total_score = sum(float(r.final_score) for r in completed if r.final_score is not None)
            ranking.append(
                {
                    "team_id": team.id,
                    "team_name": team.name,
                    "total_score": total_score,
                    "activities_completed": len(completed),
                }
            )

        ranking.sort(key=self._ranking_score, reverse=True)

        prev_total: float | None = None
        rank = 0
        for i, team_rank in enumerate(ranking, 1):
            total = self._ranking_score(team_rank)
            if prev_total is None or total != prev_total:
                rank = i
            prev_total = total
            team_rank["rank"] = rank

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

        if result2 and result2.is_completed:
            return False

        return True

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
