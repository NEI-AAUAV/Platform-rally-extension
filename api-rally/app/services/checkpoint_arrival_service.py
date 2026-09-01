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
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.dynamic_scoring import DynamicAward
from app.models.rally_settings import RallySettings
from app.models.team import Team
from app.services.event_scope import require_same_event
from app.services.leg_time_service import leg_time_points
from app.services.route_progress import (
    can_reach_checkpoint,
    closed_message,
    hours_block_reason,
    progress_for_team,
    unreachable_message,
)
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

    async def _has_arrival(self, *, team_id: int, checkpoint_id: int) -> bool:
        """Whether this (team, checkpoint) pair already has an arrival row."""
        existing = await self._db.execute(
            select(CheckpointArrival).where(
                CheckpointArrival.team_id == team_id,
                CheckpointArrival.checkpoint_id == checkpoint_id,
            )
        )
        return existing.scalars().first() is not None

    async def _require_open(
        self, *, team_obj: Team, checkpoint: CheckPoint, settings: RallySettings
    ) -> None:
        """Refuse an arrival at a post the progression has not opened yet.

        Runs **before** the arrival row is written. An arrival that gets stored
        is one the route engine accepted, which is what the rest of the system
        already assumes: a no-activity post is resolved by its arrival row
        (``route_progress._is_resolved``), a post with an arrival is un-redacted
        (``CheckpointService._redact_unreached``), and leg-time points are
        awarded off it. Writing the row first and asking afterwards let a team
        that reached post 4 out of turn resolve it for free, reveal it, and
        score it, while the visit log stayed empty.

        Opening hours are enforced by the callers before this point, so the
        progress read here is the pure ordering question.
        """
        progress = await progress_for_team(self._db, team_obj, settings)
        if progress.is_open(checkpoint.order):
            return
        raise RallyValidationError(
            unreachable_message(checkpoint, progress),
            # Same shape as the ``too_far`` rejection: fields the app can
            # render its own sentence from instead of parsing this one.
            details={
                "code": "not_open",
                "checkpoint_order": checkpoint.order,
                "open_orders": sorted(progress.open_orders),
            },
        )

    async def record_manual_arrival(self, *, team_id: int, checkpoint_id: int) -> bool:
        """Record an arrival witnessed by a guide, with no geofence check.

        GPS check-in fails for real reasons — a flat battery, no signal, an
        indoor post — and the guide is standing there watching the team. The
        guide *is* the proof, so there is no distance to validate and no
        coordinates to store.

        Everything else still applies: the cross-edition guard, the event
        window and the post's own opening hours, and the insert is idempotent
        on (team, checkpoint) exactly like the GPS path. Returns True when this
        call created the arrival.
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

        # Opening hours apply here exactly as they do to a GPS arrival. Without
        # this an out-of-hours guide arrival wrote a permanent row that revealed
        # the post (arrival short-circuits redaction) while the auto-advance
        # behind it refused, leaving the team revealed but not moved on.
        closed = hours_block_reason(checkpoint, settings)
        if closed is not None:
            raise RallyValidationError(closed_message(checkpoint, closed))

        # A repeat call is a no-op, not an ordering error: the post the team
        # already arrived at is resolved by that very row, so the order gate
        # below would refuse it. Answering "already registered" keeps the
        # endpoint idempotent, exactly as it was before the gate existed.
        if await self._has_arrival(team_id=team_id, checkpoint_id=checkpoint_id):
            return False

        # The guide's word replaces the GPS fix, not the route order: a guide
        # standing at post 4 cannot hand a team that is due at post 1 a free
        # resolution of post 4.
        await self._require_open(team_obj=team_obj, checkpoint=checkpoint, settings=settings)

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
        if await self._has_arrival(team_id=team_id, checkpoint_id=checkpoint_id):
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
                f"(max {checkpoint.arrival_radius_m}m)",
                # The band and the radius as fields, so the app renders its own
                # sentence instead of running a regex over this one.
                details={
                    "code": "too_far",
                    "distance_band": _distance_bucket(dist),
                    "max_distance_m": checkpoint.arrival_radius_m,
                },
            )

        # A second tap at a post already recorded is idempotent, and must stay
        # so: its own arrival row resolves a no-activity post, which would make
        # the order gate below reject the repeat instead of shrugging at it.
        if await self._has_arrival(team_id=team_id, checkpoint_id=checkpoint_id):
            return dist, True

        # Last gate before the row exists: standing inside the geofence of a
        # post the team is not due at yet is not an arrival, it is a detour.
        await self._require_open(team_obj=team_obj, checkpoint=checkpoint, settings=settings)

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
        """Stamp the visit time for a no-activity post the team just arrived at.

        Peddy-paper posts that only require *being there* (no staff-judged
        activity) should not wait for an evaluation that will never come. The
        arrival row is what resolves such a post for the progress engine; this
        appends the matching entry to ``team.times``, the visit-timestamp log.

        **Call this only when the arrival was newly created.** It used to run on
        every request "because the order guard inside makes it a no-op" — it
        does not. The guard asks whether the post is open *ignoring this post's
        own arrival row*, which is by definition unchanged on a repeat, so a
        team tapping check-in five times at post 1 appended five entries and was
        treated as standing at post 6.

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

        # Belt and braces. Both arrival paths now refuse an out-of-order post
        # *before* writing the row, so this can only agree with them — but it is
        # the guard that keeps ``team.times`` honest if a third caller ever
        # writes an arrival without gating it.
        # ``ignore_arrival_for`` neutralises this post's own arrival row, which
        # the caller has just written: without it the post would already read as
        # resolved and the guard would refuse the very arrival it is evaluating,
        # which is also what makes this answer match the pre-insert gate.
        settings = await rally_settings.get_or_create(self._db)
        if not await can_reach_checkpoint(
            self._db,
            team=team_obj,
            checkpoint=checkpoint_obj,
            settings=settings,
            ignore_arrival_for=checkpoint_obj.id,
        ):
            return False

        try:
            # enforce_order=False: reachability was just checked above against
            # the progress engine, with this arrival held out.
            # arrival_already_recorded=True: the caller wrote this arrival row
            # moments ago, so the row is not evidence of an earlier visit — it
            # is this one, and the timestamp for it is still owed.
            await checkin_team_to_checkpoint(
                self._db,
                team_id,
                checkpoint_id,
                enforce_order=False,
                arrival_already_recorded=True,
            )
            return True
        except Exception as exc:  # advancement is best-effort; arrival still succeeds
            logger.warning(
                f"Auto-complete on arrival failed for team {team_id} "
                f"at checkpoint {checkpoint_id}: {exc}"
            )
            return False
