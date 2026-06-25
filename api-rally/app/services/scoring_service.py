"""
Scoring system service for Rally activities
"""
from typing import Any
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import logging
from datetime import datetime, timezone
from fastapi import HTTPException, status

from app.models.activity import ActivityResult, Activity
from app.models.team import Team
from app.models.rally_settings import RallySettings
from app.schemas.activity_types import ActivityType
from app.models.activity_factory import ActivityFactory
from app.schemas.activity import ActivityResultCreate, ActivityResultUpdate
from app.crud.crud_activity import activity_result as activity_result_crud
from app.core.exceptions import RallyError, RallyValidationError

logger = logging.getLogger(__name__)


class ScoringService:
    """Service for handling Rally scoring rules and calculations"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._settings: RallySettings | None = None

    async def _team_size(self, team_id: int) -> int:
        """Number of members on a team (min 1 for scoring) """
        team = await self.db.scalar(
            select(Team).options(selectinload(Team.members)).where(Team.id == team_id)
        )
        return len(team.members) if team and team.members else 1

    async def _completed_times(self, activity_id: int, extra_time: float | None = None) -> list[float]:
        """ All completion times for an activity's completed results

            Pass extra_time to include a result not yet persisted (create path)
        """

        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id,
            ActivityResult.is_completed.is_(True)
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
        """ Single source of truth for scoring a result.

        For time-based games, pass all_times (full set to rank against, including this results own time)
        to use relative ranking; otherwise, base scoring.
        """

        instance = ActivityFactory.create_activity(activity_type, config)

        is_time_based = activity_type == ActivityType.TIME_BASED.value
        this_time = result_data.get("completion_time_seconds")

        if is_time_based and this_time is not None:
            if all_times and len(all_times) > 1 and hasattr(instance, "calculate_relative_ranking_score"):
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
                # Create default settings if none exist
                self._settings = RallySettings()
                self.db.add(self._settings)
                await self.db.commit()
        if self._settings is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to get or create rally settings"
            )
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

    async def update_team_scores(self, team_id: int, should_commit: bool = True) -> bool:
        """Update team's total and score_per_checkpoint based on activity results"""
        team = await self.db.get(Team, team_id)
        if not team:
            return False

        # Get all activity results for this team with activities and checkpoints preloaded
        # Use joinedload to avoid N+1 queries
        stmt = select(ActivityResult).options(
            joinedload(ActivityResult.activity).joinedload(Activity.checkpoint)
        ).where(ActivityResult.team_id == team_id)
        results = (await self.db.scalars(stmt)).all()

        # Group results by checkpoint order (not checkpoint ID)
        checkpoint_scores: dict[int, float] = {}
        total_score = 0.0

        for result in results:
            if result.is_completed and result.final_score is not None:
                # Activity and checkpoint are already loaded via joinedload
                if result.activity and result.activity.checkpoint:
                    # Use checkpoint order instead of checkpoint ID
                    checkpoint_order = result.activity.checkpoint.order
                    if checkpoint_order not in checkpoint_scores:
                        checkpoint_scores[checkpoint_order] = 0.0
                    checkpoint_scores[checkpoint_order] += result.final_score
                    total_score += result.final_score

        # Update team scores
        team.total = int(total_score)

        # Update score_per_checkpoint array to match times array length
        # Map scores by checkpoint order (1, 2, 3, ...) not by checkpoint ID
        # The times array represents checkpoint visit order
        team.score_per_checkpoint = [
            int(checkpoint_scores.get(i + 1, 0.0)) for i in range(len(team.times))
        ]

        # Commit only if explicitly requested
        if should_commit:
            try:
                await self.db.commit()
            except Exception as e:
                logger.error(f"Failed to update team scores: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to update team scores: {str(e)}"
                )

        return True

    async def apply_extra_shots_bonus(self, team_id: int, activity_id: int, extra_shots: int) -> bool:
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
            ActivityResult.activity_id == activity_id,
            ActivityResult.team_id == team_id
        )
        result = (await self.db.scalars(stmt)).first()
        if not result:
            return False

        # Update extra shots
        result.extra_shots = extra_shots

        # Recalculate final score
        await self._recalculate_result_score(result)

        await self.db.commit()
        return True

    async def apply_penalty(self, team_id: int, activity_id: int, penalty_type: str, penalty_value: int) -> bool:
        """Apply penalty to a team's activity result"""
        stmt = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id,
            ActivityResult.team_id == team_id
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
        return True

    async def apply_vomit_penalty(self, team_id: int, activity_id: int) -> bool:
        """Apply vomit penalty (configurable points)"""
        settings = await self._get_settings()
        return await self.apply_penalty(team_id, activity_id, "vomit", abs(settings.penalty_per_puke))

    async def apply_drink_penalty(self, team_id: int, activity_id: int, participants_not_drinking: int) -> bool:
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

    def _set_activity_specific_scores(self, db_obj: ActivityResult, activity: Activity, result_data: dict[str, Any]) -> None:
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
        completion_time = obj_in.result_data.get('completion_time_seconds')
        all_times = (
            await self._completed_times(
                obj_in.activity_id,
                extra_time=float(completion_time) if completion_time is not None else None,
            )
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
        if recalc and is_time_based:
            await self._recalculate_all_results_for_activity(activity.id, exclude_result_id=db_obj.id)

        if update_team_scores:
            await self.update_team_scores(obj_in.team_id)

        return db_obj

    async def update_result(self, db_obj: ActivityResult, obj_in: ActivityResultUpdate) -> ActivityResult:
        """Apply an update to a result, rescoring when result_data changed."""
        update_data = activity_result_crud.apply_update(db_obj, obj_in)

        if 'result_data' in update_data:
            activity = await self.db.get(Activity, db_obj.activity_id)
            if activity:
                # Refresh the type-specific score column before rescoring; ranking
                # queries read it, so a stale time_score would skew the distribution.
                self._set_activity_specific_scores(db_obj, activity, db_obj.result_data)

            await self._recalculate_result_score(db_obj)

            if activity and activity.activity_type == ActivityType.TIME_BASED.value:
                await self._recalculate_all_results_for_activity(activity.id)

        await activity_result_crud.persist(self.db, db_obj)
        await self.update_team_scores(db_obj.team_id)
        return db_obj

    async def remove_result(self, result_id: int) -> ActivityResult | None:
        """Delete a result and refresh the owning team's scores."""
        db_obj = await activity_result_crud.get(self.db, result_id)
        if db_obj is None:
            return None

        team_id = db_obj.team_id
        await activity_result_crud.delete(self.db, db_obj=db_obj)
        await self.update_team_scores(team_id)
        return db_obj

    async def _recalculate_all_results_for_activity(self, activity_id: int, exclude_result_id: int | None = None, *, commit: bool = True) -> None:
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
            ActivityResult.activity_id == activity_id,
            ActivityResult.is_completed.is_(True)
        )
        if exclude_result_id is not None:
            stmt = stmt.where(ActivityResult.id != exclude_result_id)

        all_results = list((await self.db.scalars(stmt)).all())
        if not all_results:
            return

        all_times = [float(r.time_score) for r in all_results if r.time_score is not None]
        if exclude_result_id is not None:
            excluded = await self.db.get(ActivityResult, exclude_result_id)
            if excluded and excluded.time_score:
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

    async def get_team_ranking(self, activity_id: int | None = None) -> list[dict[str, Any]]:
        """Get team ranking for specific activity or global ranking"""
        if activity_id:
            # Activity-specific ranking - sort by score descending before assigning ranks
            # Use joinedload to avoid N+1 queries
            stmt = select(ActivityResult).options(
                joinedload(ActivityResult.team)
            ).where(ActivityResult.activity_id == activity_id)
            results = (await self.db.scalars(stmt)).all()
            # Sort results by final_score in descending order, None scores go last
            results = sorted(results, key=lambda r: (r.final_score is not None, r.final_score or 0), reverse=True)

            # Completed-activity count per team, in one grouped query (avoids an
            # N+1 SELECT per ranked result).
            count_stmt = (
                select(ActivityResult.team_id, func.count())
                .where(ActivityResult.is_completed.is_(True))
                .group_by(ActivityResult.team_id)
            )
            completed_counts: dict[int, int] = {
                team_id: count for team_id, count in (await self.db.execute(count_stmt)).all()
            }

            ranking = []
            for i, result in enumerate(results, 1):
                # Team is already loaded via joinedload, but check if it exists
                if result.team:
                    team_activity_count = completed_counts.get(result.team.id, 0)
                    ranking.append({
                        'rank': i,
                        'team_id': result.team.id,
                        'team_name': result.team.name,
                        'score': result.final_score or 0,
                        'activities_completed': team_activity_count,
                        'completed_at': result.completed_at
                    })
        else:
            # Global ranking
            team_stmt = select(Team).options(selectinload(Team.activity_results))
            teams: list[Team] = list((await self.db.scalars(team_stmt)).all())
            ranking = []
            for team in teams:
                # activity_results are eager-loaded via selectinload above; compute
                # the total from them instead of a per-team query (avoids N+1).
                completed = [r for r in team.activity_results if r.is_completed]
                total_score = sum(
                    float(r.final_score) for r in completed if r.final_score is not None
                )
                ranking.append({
                    'team_id': team.id,
                    'team_name': team.name,
                    'total_score': total_score,
                    'activities_completed': len(completed)
                })

            # Sort by total score descending
            def get_score(item: dict[str, Any]) -> float:
                score = item.get('total_score', 0)
                return float(score) if score is not None else 0.0
            ranking.sort(key=get_score, reverse=True)

            # Add ranks
            for i, team_rank in enumerate(ranking, 1):
                team_rank['rank'] = i

        return ranking

    async def get_activity_statistics(self, activity_id: int) -> dict[str, Any]:
        """Get statistics for a specific activity"""
        stmt = select(ActivityResult).where(ActivityResult.activity_id == activity_id)
        results = (await self.db.scalars(stmt)).all()

        if not results:
            return {
                'total_participants': 0,
                'average_score': 0,
                'best_score': 0,
                'worst_score': 0,
                'completion_rate': 0
            }

        completed_results = [r for r in results if r.is_completed and r.final_score is not None]
        scores = [float(r.final_score) for r in completed_results if r.final_score is not None]

        return {
            'total_participants': len(results),
            'completed_participants': len(completed_results),
            'average_score': sum(scores) / len(scores) if scores else 0.0,
            'best_score': max(scores) if scores else 0.0,
            'worst_score': min(scores) if scores else 0.0,
            'completion_rate': len(completed_results) / len(results) if results else 0.0
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
            ActivityResult.activity_id == activity_id,
            ActivityResult.team_id == team1_id
        )
        result1 = (await self.db.scalars(stmt1)).first()

        stmt2 = select(ActivityResult).where(
            ActivityResult.activity_id == activity_id,
            ActivityResult.team_id == team2_id
        )
        result2 = (await self.db.scalars(stmt2)).first()

        if result1 and result1.is_completed:
            return False

        if result2 and result2.is_completed:
            return False

        return True

    async def create_team_vs_result(self, team1_id: int, team2_id: int, activity_id: int,
                             winner_id: int, match_data: dict[str, Any]) -> tuple[ActivityResult, ActivityResult]:
        """Create results for both teams in a team vs team activity.

        Returns the two persisted results. Raises RallyValidationError if the
        teams cannot compete; any unexpected failure is rolled back and
        re-raised (never swallowed into a misleading return value).
        """
        if not await self.validate_team_vs_match(team1_id, team2_id, activity_id):
            raise RallyValidationError("Teams cannot compete in this activity")

        # Determine results
        team1_result = "win" if winner_id == team1_id else ("draw" if winner_id == 0 else "lose")
        team2_result = "win" if winner_id == team2_id else ("draw" if winner_id == 0 else "lose")

        # Create result for team 1
        result1_data = {
            'result': team1_result,
            'opponent_team_id': team2_id,
            **match_data
        }

        # Create result for team 2
        result2_data = {
            'result': team2_result,
            'opponent_team_id': team1_id,
            **match_data
        }

        try:
            # Create both results

            result1_create = ActivityResultCreate(
                activity_id=activity_id,
                team_id=team1_id,
                result_data=result1_data
            )

            result2_create = ActivityResultCreate(
                activity_id=activity_id,
                team_id=team2_id,
                result_data=result2_data
            )

            # Use datetime.now(timezone.utc) instead of func.now() for proper datetime value
            current_time = datetime.now(timezone.utc)

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

            return result1_db_obj, result2_db_obj

        except RallyError:
            await self.db.rollback()
            raise
        except Exception:
            await self.db.rollback()
            logger.exception("Failed to create team vs team results")
            raise
