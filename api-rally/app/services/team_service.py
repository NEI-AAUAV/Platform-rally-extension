"""Business rules and orchestration for teams.

Owns the transaction boundary and validation rules that used to live split
across ``app.crud.crud_team`` (data access + business rules + commits) and
``app.api.api_v1.team`` (checkpoint-progress computation inline in the
router). ``CRUDTeam`` keeps thin delegating wrappers for
``add_checkpoint``/``calculate_min_time_scores``/``calculate_checkpoint_score``
/``update_classification`` so existing callers (routers, other services,
tests) keep working while the logic itself lives here.
"""

import math
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.crud.crud_activity import activity
from app.crud.crud_activity import activity_result as activity_result_crud
from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import CRUDTeam
from app.models.checkpoint import CheckPoint
from app.models.team import Team
from app.schemas.team import DetailedTeam, ListingTeam, TeamScoresUpdate
from app.services.scoring_service import ScoringService


class TeamService:
    """Team lifecycle, checkpoint progression, and classification rules."""

    def __init__(self, db: AsyncSession, team_crud: CRUDTeam) -> None:
        self._db = db
        self._team_crud = team_crud

    @staticmethod
    def calculate_min_time_scores(teams: Sequence[Team]) -> list[float]:
        all_time_scores = [t.time_scores + [0] * (8 - len(t.time_scores)) for t in teams]

        return [
            min((s if s != 0 else math.inf) for s in scores)
            for scores in zip(*all_time_scores, strict=False)
        ]

    @staticmethod
    def calculate_checkpoint_score(
        checkpoint: int,
        *,
        team: Team,
        min_time_scores: list[float],
        penalty_per_puke: int = -20,
    ) -> int:
        def calc_time_score(checkpoint: int, score: int) -> int:
            return int(min_time_scores[checkpoint] / score * 10) if score != 0 else 0

        def calc_question_scores(is_correct: bool) -> int:
            return int(is_correct) * 8

        def calc_pukes(pukes: int) -> int:
            return pukes * penalty_per_puke

        def calc_skips(skips: int) -> int:
            if skips > 0:
                return skips * -8
            return abs(skips) * 4

        return (
            calc_time_score(
                checkpoint,
                team.time_scores[checkpoint] if checkpoint < len(team.time_scores) else 0,
            )
            + calc_question_scores(
                team.question_scores[checkpoint]
                if checkpoint < len(team.question_scores)
                else False
            )
            + calc_skips(team.skips[checkpoint] if checkpoint < len(team.skips) else 0)
            + calc_pukes(team.pukes[checkpoint] if checkpoint < len(team.pukes) else 0)
        )

    async def update_classification_unlocked(self) -> None:
        """Update team classifications based on activity results."""
        teams = list(await self._team_crud.get_multi(db=self._db, for_update=True))
        scoring_service = ScoringService(self._db)

        # Recompute every team's scores in bulk (2 queries total) rather than
        # per-team in a loop (which was 3 queries + a refresh each). Teams are
        # already row-locked via for_update above; the batch mutates them in
        # the same session, so no nested transaction or refresh is needed.
        await scoring_service.update_all_team_scores(teams)

        # Sort teams by total score (descending), then by name (ascending)
        teams.sort(key=lambda t: (-t.total, t.name))

        for i, team in enumerate(teams):
            team.classification = i + 1
            self._db.add(team)

    async def update_classification(self) -> None:
        await self.update_classification_unlocked()
        await self._db.commit()

    def _validate_rally_timing(self, settings: Any, current_time: datetime) -> None:
        """Validate rally timing constraints."""
        if settings.rally_start_time and current_time < settings.rally_start_time:
            raise RallyValidationError(
                f"Rally has not started yet. Starts at {settings.rally_start_time.isoformat()}"
            )

        if settings.rally_end_time and current_time > settings.rally_end_time:
            raise RallyValidationError(
                f"Rally has ended. Ended at {settings.rally_end_time.isoformat()}"
            )

    async def _validate_checkpoint_order(
        self, team: Team, checkpoint_id: int, settings: Any
    ) -> None:
        """Validate checkpoint order constraints."""
        checkpoint_obj = await self._db.get(CheckPoint, checkpoint_id)
        if not checkpoint_obj:
            raise RallyNotFoundError("Checkpoint not found")

        checkpoint_order = checkpoint_obj.order

        if settings.checkpoint_order_matters:
            # Team should have visited exactly (order - 1) checkpoints
            if len(team.times) != checkpoint_order - 1:
                raise RallyValidationError(
                    f"Checkpoint not in order. Expected checkpoint order "
                    f"{len(team.times) + 1}, got {checkpoint_order}"
                )
        # If order doesn't matter, just check if checkpoint already visited by order
        elif checkpoint_order <= len(team.times):
            raise RallyValidationError(f"Checkpoint {checkpoint_order} already visited")

    async def add_checkpoint(
        self, *, id: int, checkpoint_id: int, obj_in: TeamScoresUpdate
    ) -> Team:
        """Record a team's arrival/score at a checkpoint and recompute classification.

        The transaction boundary: settings are resolved before the savepoint
        (``get_or_create`` may itself commit — event bootstrap, legacy
        adoption, timing sync — and a commit inside ``begin_nested()`` would
        close the outer transaction), scores are appended inside the
        savepoint, then the whole thing commits and classification recomputes.
        """
        settings = await rally_settings.get_or_create(self._db)
        async with self._db.begin_nested():
            team = await self._team_crud.get(db=self._db, id=id, for_update=True)
            current_time = datetime.now(UTC)

            self._validate_rally_timing(settings, current_time)
            await self._validate_checkpoint_order(team, checkpoint_id, settings)

            team.record_checkpoint(
                question_score=bool(obj_in.question_score),
                time_score=obj_in.time_score,
                pukes=obj_in.pukes,
                skips=obj_in.skips,
                at=current_time.replace(tzinfo=None),
            )

        await self._db.commit()
        await self.update_classification()
        await self._db.refresh(team)
        return team

    async def compute_checkpoint_progress(self, team_obj: Team) -> tuple[int, int, str | None]:
        """Compute last fully completed checkpoint and current checkpoint.

        A checkpoint is considered completed only when all its activities have
        a completed result for this team.
        Returns: (last_completed_order, current_order, last_checkpoint_name)
        """
        checkpoints = await checkpoint_crud.get_all_ordered(self._db)
        team_results = await activity_result_crud.get_by_team(self._db, team_id=team_obj.id)
        completed_activity_ids = {
            r.activity_id for r in team_results if getattr(r, "is_completed", False)
        }
        # Number of checkpoints the team has physically checked into (times grows
        # by one per checkpoint reached, in order).
        checked_in_count = len(team_obj.times)

        last_completed_order = 0
        last_completed_name: str | None = None
        for cp in checkpoints:
            cp_activities = await activity.get_by_checkpoint(self._db, checkpoint_id=cp.id)
            active_ids = [a.id for a in cp_activities if a.is_active]
            if not active_ids:
                # No activity to judge here: the post counts as done once the
                # team has checked in (via GPS arrival auto-complete).
                # Otherwise it is still their current, not-yet-reached post —
                # stop here.
                if checked_in_count >= cp.order:
                    last_completed_order = cp.order
                    last_completed_name = cp.name
                    continue
                break
            if all(aid in completed_activity_ids for aid in active_ids):
                last_completed_order = cp.order
                last_completed_name = cp.name
            else:
                break

        max_order = checkpoints[-1].order if checkpoints else 0
        current_order = (
            last_completed_order + 1 if last_completed_order < max_order else last_completed_order
        )
        return last_completed_order, current_order, last_completed_name

    async def build_listing_team(self, team: Team) -> ListingTeam:
        """Build team data for listing using strict completion rules."""
        (
            last_checkpoint_number,
            current_checkpoint_number,
            last_checkpoint_name,
        ) = await self.compute_checkpoint_progress(team)

        return ListingTeam(
            id=team.id,
            name=team.name,
            total=team.total,
            classification=team.classification,
            versus_group_id=team.versus_group_id,
            times=team.times,
            last_checkpoint_time=team.last_checkpoint_time,
            last_checkpoint_score=team.last_checkpoint_score,
            last_checkpoint_number=last_checkpoint_number,
            last_checkpoint_name=last_checkpoint_name,
            current_checkpoint_number=current_checkpoint_number,
            num_members=team.num_members,
        )

    async def build_detailed_team(
        self, team_obj: Team, *, with_progress: bool = False
    ) -> DetailedTeam:
        """Serialize a team to DetailedTeam, eager-loading the members relationship
        (DetailedTeam includes members, which would otherwise lazy-load)."""
        await self._db.refresh(team_obj, ["members"])
        result = DetailedTeam.model_validate(team_obj)
        if with_progress:
            last_cp, current_cp, _ = await self.compute_checkpoint_progress(team_obj)
            result.last_checkpoint_number = last_cp
            result.current_checkpoint_number = current_cp
            result.total_checkpoints = len(await checkpoint_crud.get_all_ordered(self._db))
        return result
