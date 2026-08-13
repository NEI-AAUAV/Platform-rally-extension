"""Business rules for GPS geofence arrival: distance validation, idempotent
arrival recording, no-activity checkpoint auto-completion, and leg-time
scoring.
"""

import contextlib
from datetime import UTC, datetime

from loguru import logger
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.api_v1.staff_evaluation_utils import checkin_team_to_checkpoint
from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.crud import crud_activity
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import CRUDTeam
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.dynamic_scoring import DynamicAward
from app.models.rally_settings import RallySettings
from app.services.checkin_service import require_same_event
from app.services.leg_time_service import leg_time_points
from app.services.route_progress import can_reach_checkpoint, closed_message, hours_block_reason
from app.services.scoring_service import ScoringService
from app.services.team_service import validate_rally_timing
from app.utils.geo import distance_m

# Coarse distance bands reported to the client on a rejected arrival, in
# ascending order of (upper bound, label). The last entry is the catch-all.
_DISTANCE_BUCKETS: tuple[tuple[float, str], ...] = (
    (100.0, "menos de 100m"),
    (500.0, "menos de 500m"),
    (2_000.0, "menos de 2km"),
)
_DISTANCE_BUCKET_FAR = "mais de 2km"


def _distance_bucket(dist: float) -> str:
    """Bucket a distance into a coarse band so a rejection never reveals the
    precise metre count (which would expose hidden checkpoint coordinates)."""
    for upper, label in _DISTANCE_BUCKETS:
        if dist < upper:
            return label
    return _DISTANCE_BUCKET_FAR


class CheckpointArrivalService:
    """GPS geofence check-in: distance validation, idempotent recording, auto-advance."""

    def __init__(
        self, db: AsyncSession, checkpoint_crud: CRUDCheckPoint, team_crud: CRUDTeam
    ) -> None:
        self._db = db
        self._checkpoint_crud = checkpoint_crud
        self._team_crud = team_crud

    async def record_manual_arrival(self, *, team_id: int, checkpoint_id: int) -> bool:
        """Record an arrival witnessed by a guide, with no geofence check.

        GPS check-in fails for real reasons — a flat battery, no signal, an
        indoor post — and the guide is standing there watching the team. The
        guide *is* the proof, so there is no distance to validate and no
        coordinates to store.

        Everything else still applies: the cross-edition guard and the event
        window, and the insert is idempotent on (team, checkpoint) exactly like
        the GPS path. Returns True when this call created the arrival.
        """
        checkpoint = await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)
        if not checkpoint:
            raise RallyNotFoundError("Checkpoint not found")

        team_obj = await self._team_crud.get(db=self._db, id=team_id)
        require_same_event(team_obj.event_id, checkpoint.event_id)

        settings = await rally_settings.get_or_create(self._db)
        validate_rally_timing(
            settings,
            datetime.now(UTC),
            start_offset_minutes=team_obj.start_offset_minutes or 0,
        )

        arrival = await self._insert_arrival(
            team_id=team_id, checkpoint_id=checkpoint_id, latitude=None, longitude=None
        )
        if arrival is not None:
            await self._award_leg_time(
                team_id=team_id,
                checkpoint_id=checkpoint_id,
                arrived_at=arrival.arrived_at,
                event_id=team_obj.event_id,
                settings=settings,
            )
        return arrival is not None

    async def _insert_arrival(
        self,
        *,
        team_id: int,
        checkpoint_id: int,
        latitude: float | None,
        longitude: float | None,
    ) -> CheckpointArrival | None:
        """Idempotent insert. Returns the created row, or None when an
        arrival for this (team, checkpoint) pair already existed."""
        existing = await self._db.execute(
            select(CheckpointArrival).where(
                CheckpointArrival.team_id == team_id,
                CheckpointArrival.checkpoint_id == checkpoint_id,
            )
        )
        if existing.scalars().first() is not None:
            return None

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
            # Lost a race against a concurrent arrival for the same pair.
            await self._db.rollback()
            return None
        # arrived_at is a server_default, only populated on the DB side.
        await self._db.refresh(arrival)
        return arrival

    async def _award_leg_time(
        self,
        *,
        team_id: int,
        checkpoint_id: int,
        arrived_at: datetime,
        event_id: int | None,
        settings: RallySettings,
    ) -> None:
        """Score the leg between a team's previous arrival and this one, if
        leg-time scoring is on. Best-effort: a failure here must never fail
        the arrival itself, matching the auto-complete-on-arrival pattern.
        """
        if not settings.leg_time_scoring_enabled:
            return
        try:
            previous = await self._db.scalar(
                select(CheckpointArrival)
                .where(
                    CheckpointArrival.team_id == team_id,
                    CheckpointArrival.checkpoint_id != checkpoint_id,
                )
                .order_by(CheckpointArrival.arrived_at.desc())
                .limit(1)
            )
            if previous is None:
                return  # first checkpoint of the route — no leg before it
            leg_minutes = (arrived_at - previous.arrived_at).total_seconds() / 60
            if leg_minutes <= 0:
                return  # clock skew / same-instant race guard
            points = leg_time_points(
                leg_minutes=leg_minutes,
                target_minutes=float(settings.leg_time_target_minutes),
                points_per_minute=float(settings.leg_time_points_per_minute),
                max_adjustment=float(settings.leg_time_max_adjustment),
            )
            if points == 0:
                return
            self._db.add(
                DynamicAward(
                    team_id=team_id,
                    event_id=event_id,
                    points=points,
                    reason=f"Tempo de percurso até ao posto #{checkpoint_id}",
                    is_active=True,
                )
            )
            await self._db.commit()
            await ScoringService(self._db).update_team_scores(team_id)
        except Exception as exc:
            logger.warning(
                f"Leg-time scoring failed for team {team_id} at checkpoint {checkpoint_id}: {exc}"
            )
            with contextlib.suppress(Exception):
                await self._db.rollback()

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

        # Cross-edition guard, same rule the QR check-in paths apply: a team of
        # one edition must never register progress against another's route.
        team_obj = await self._team_crud.get(db=self._db, id=team_id)
        require_same_event(team_obj.event_id, checkpoint.event_id)

        # An arrival is progress, so the event window applies here exactly as it
        # does to a staff evaluation. Checking before the insert (rather than
        # relying on the auto-advance path further down) keeps a pre-event or
        # post-event scan out of the arrivals table and the audit log entirely.
        settings = await rally_settings.get_or_create(self._db)
        validate_rally_timing(
            settings,
            datetime.now(UTC),
            start_offset_minutes=team_obj.start_offset_minutes or 0,
        )

        # A post with opening hours refuses arrivals outside them. Rejected
        # here rather than silently failing to auto-advance further down, so a
        # team standing at a bar that opens in an hour is told so.
        closed = hours_block_reason(checkpoint, settings)
        if closed is not None:
            raise RallyValidationError(closed_message(checkpoint, closed))

        if checkpoint.latitude is None or checkpoint.longitude is None:
            raise RallyValidationError("Checkpoint has no GPS coordinates")

        dist = distance_m(latitude, longitude, checkpoint.latitude, checkpoint.longitude)
        if dist > checkpoint.arrival_radius_m:
            # Deliberately coarse: the exact metre count would let a team that
            # cannot see a post's coordinates (focused route mode) trilaterate
            # them from a handful of rejected attempts. Precise value → logs only.
            logger.info(
                f"Arrival rejected for team {team_id} at checkpoint {checkpoint_id}: "
                f"{dist:.0f}m (max {checkpoint.arrival_radius_m}m)"
            )
            raise RallyValidationError(
                f"Too far from checkpoint: {_distance_bucket(dist)} "
                f"(max {checkpoint.arrival_radius_m}m)"
            )

        arrival = await self._insert_arrival(
            team_id=team_id,
            checkpoint_id=checkpoint_id,
            latitude=latitude,
            longitude=longitude,
        )
        if arrival is not None:
            await self._award_leg_time(
                team_id=team_id,
                checkpoint_id=checkpoint_id,
                arrived_at=arrival.arrived_at,
                event_id=team_obj.event_id,
                settings=settings,
            )
        return dist, arrival is None

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

        # Only auto-advance when the team may actually check in here. This mirrors
        # add_checkpoint's own validation (same predicate) so the guard tracks the
        # `checkpoint_order_matters` setting instead of assuming strict order —
        # under free-order routes every no-activity post would otherwise stay stuck.
        settings = await rally_settings.get_or_create(self._db)
        if not await can_reach_checkpoint(
            self._db, team=team_obj, checkpoint=checkpoint_obj, settings=settings
        ):
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
