"""Business rules for GPS geofence arrival: distance validation, idempotent
arrival recording, and no-activity checkpoint auto-completion.
"""

from loguru import logger
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.api_v1.staff_evaluation_utils import checkin_team_to_checkpoint
from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.crud import crud_activity
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_team import CRUDTeam
from app.models.checkpoint_arrival import CheckpointArrival
from app.utils.geo import distance_m


class CheckpointArrivalService:
    """GPS geofence check-in: distance validation, idempotent recording, auto-advance."""

    def __init__(
        self, db: AsyncSession, checkpoint_crud: CRUDCheckPoint, team_crud: CRUDTeam
    ) -> None:
        self._db = db
        self._checkpoint_crud = checkpoint_crud
        self._team_crud = team_crud

    async def record_arrival(
        self, *, team_id: int, checkpoint_id: int, latitude: float, longitude: float
    ) -> tuple[float, bool]:
        """Validate the team's GPS position against the checkpoint's geofence
        and idempotently record the arrival.

        Returns (distance_m, already_registered).
        """
        # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
        # (mapped to 404 by the app's exception handler), so this branch is
        # unreachable in practice; kept as a defensive guard.
        checkpoint = await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)
        if not checkpoint:
            raise RallyNotFoundError("Checkpoint not found")

        if checkpoint.latitude is None or checkpoint.longitude is None:
            raise RallyValidationError("Checkpoint has no GPS coordinates")

        dist = distance_m(latitude, longitude, checkpoint.latitude, checkpoint.longitude)
        if dist > checkpoint.arrival_radius_m:
            raise RallyValidationError(
                f"Too far from checkpoint: {dist:.0f}m (max {checkpoint.arrival_radius_m}m)"
            )

        existing = await self._db.execute(
            select(CheckpointArrival).where(
                CheckpointArrival.team_id == team_id,
                CheckpointArrival.checkpoint_id == checkpoint_id,
            )
        )
        already_registered = existing.scalars().first() is not None

        if not already_registered:
            arrival = CheckpointArrival(
                team_id=team_id,
                checkpoint_id=checkpoint_id,
                latitude=latitude,
                longitude=longitude,
            )
            self._db.add(arrival)
            try:
                await self._db.commit()
            except IntegrityError:
                await self._db.rollback()
                already_registered = True

        return dist, already_registered

    async def auto_complete_if_no_activities(self, team_id: int, checkpoint_id: int) -> bool:
        """Mark a no-activity checkpoint as completed on GPS arrival and advance.

        Peddy-paper posts that only require *being there* (no staff-judged
        activity) should not wait for an evaluation that will never come. When a
        team checks in at such a post and it is the post they are currently due to
        reach, we check them in — which appends this checkpoint to team.times and
        moves their "current" pointer to the next post.

        Posts that DO have activities are left untouched: those only advance once
        staff submits the activity result (handled by check_and_advance_team).
        """
        # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
        # rather than returning None, so this branch is unreachable in practice
        # (the caller already validated the checkpoint exists); kept defensively.
        checkpoint_obj = await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)
        if not checkpoint_obj:
            return False

        activities = await crud_activity.activity.get_by_checkpoint(
            self._db, checkpoint_id=checkpoint_id
        )
        if any(a.is_active for a in activities):
            return False  # has activities → staff-driven advancement

        # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
        # rather than returning None, so this branch is unreachable in practice
        # (a team with a valid arrival JWT necessarily still exists); kept as a
        # defensive guard.
        team_obj = await self._team_crud.get(db=self._db, id=team_id)
        if not team_obj:
            return False

        # Only auto-advance when this is exactly the post the team is due to reach;
        # add_checkpoint's order validation would reject out-of-sequence check-ins
        # anyway, but guarding here avoids noisy 400s in the logs.
        if len(team_obj.times) != checkpoint_obj.order - 1:
            return False

        try:
            await checkin_team_to_checkpoint(self._db, team_id, checkpoint_id)
            return True
        except Exception as exc:  # advancement is best-effort; arrival still succeeds
            logger.warning(
                f"Auto-complete on arrival failed for team {team_id} "
                f"at checkpoint {checkpoint_id}: {exc}"
            )
            return False
