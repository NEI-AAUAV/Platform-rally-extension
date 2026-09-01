"""
Utility functions for staff evaluation endpoints

This module contains helper functions for:
- Serialization of activity and team data
- Permission validation
- Team checkpoint progression and advancement
- Checkpoint progress calculation
"""

from typing import Any

from loguru import logger
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api import deps
from app.api.auth import AuthData
from app.core.exceptions import RallyForbiddenError, RallyNotFoundError, RallyValidationError
from app.crud.crud_activity import activity, activity_result
from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team
from app.models.activity import Activity, ActivityResult
from app.models.team import Team
from app.schemas.activity import (
    ActivityResultCreate,
    ActivityResultEvaluation,
    ActivityResultUpdate,
)
from app.schemas.user import DetailedUser
from app.services.checkpoint_visits import append_visit_entry, record_visit
from app.services.event_scope import require_same_event
from app.services.route_progress import RouteSnapshot, progress_for_team
from app.services.scoring_service import EvaluationEditor, ScoringService

# Error message constants
NO_CHECKPOINT_ASSIGNED = "No checkpoint assigned to this staff member"
TEAM_NOT_FOUND = "Team not found"


# =============================================================================
# Serialization Functions
# =============================================================================


def serialize_activity(result: ActivityResult) -> dict[str, Any] | None:
    """Helper function to serialize activity information.

    Expects result.activity to be eager-loaded by the caller's query.
    """
    if result.activity:
        return {
            "id": result.activity.id,
            "name": result.activity.name,
            "activity_type": result.activity.activity_type,
            "checkpoint_id": result.activity.checkpoint_id,
            "description": result.activity.description,
            "config": result.activity.config,
            "is_active": result.activity.is_active,
        }
    return None


def serialize_team(result: ActivityResult) -> dict[str, Any] | None:
    """Helper function to serialize team information including member count.

    Expects result.team and result.team.members to be eager-loaded by the
    caller's query (accessing them lazily would fail on the async session).
    """
    if result.team:
        return {
            "id": result.team.id,
            "name": result.team.name,
            "total": result.team.total,
            "num_members": len(result.team.members) if result.team.members else 0,
        }
    return None


# =============================================================================
# Permission Validation
# =============================================================================


def validate_rally_permissions(auth: AuthData) -> bool:
    """Validate that user has rally permissions"""
    return deps.is_admin_or_staff(auth.scopes)


def is_admin_or_manager(auth: AuthData) -> bool:
    """Check if user is admin or manager"""
    return deps.is_admin_or_manager(auth.scopes)


async def validate_staff_checkpoint_access(
    db: AsyncSession, current_user: DetailedUser, team_id: int, activity_id: int
) -> tuple[Team, Activity]:
    """Validate staff checkpoint access and return team and activity objects"""
    logger.info(
        f"Validating staff access: user_id={current_user.id}, "
        f"staff_checkpoint_id={current_user.staff_checkpoint_id}, "
        f"team_id={team_id}, activity_id={activity_id}"
    )

    if not current_user.staff_checkpoint_id:
        logger.error(f"User {current_user.id} has no checkpoint assignment")
        raise RallyForbiddenError(NO_CHECKPOINT_ASSIGNED)

    # Verify team exists
    # CRUDBase.get() raises RallyNotFoundError rather than returning None, so
    # this branch is unreachable in practice; kept as a defensive guard.
    team_obj = await team.get(db, id=team_id)
    if not team_obj:
        logger.error(f"Team {team_id} not found")
        raise RallyNotFoundError(TEAM_NOT_FOUND)

    # NOTE: We don't check team checkpoint progress here.
    # Staff should be able to evaluate any team at their assigned checkpoint,
    # regardless of whether the team has been formally checked in yet.
    team_checkpoint_number = len(team_obj.times)
    logger.info(
        f"Team {team_id} currently at checkpoint {team_checkpoint_number}, "
        f"staff assigned to checkpoint {current_user.staff_checkpoint_id}"
    )

    # Verify activity is at the same checkpoint
    activity_obj = await activity.get(db, id=activity_id)
    if not activity_obj:
        logger.error(f"Activity {activity_id} not found")
        raise RallyNotFoundError("Activity not found")

    logger.info(f"Activity {activity_id} belongs to checkpoint {activity_obj.checkpoint_id}")

    if activity_obj.checkpoint_id != current_user.staff_checkpoint_id:
        logger.warning(
            f"Activity checkpoint mismatch: {activity_obj.checkpoint_id} != "
            f"{current_user.staff_checkpoint_id}"
        )
        raise RallyNotFoundError("Activity not found at your assigned checkpoint")

    # Progress is deliberately not checked (see above); the *edition* is, as it
    # is on every other write path (``require_same_event``). A result scored
    # here resolves the post and moves the team's total, so a team of a past
    # edition must not acquire one against this one's activity.
    require_same_event(team_obj.event_id, activity_obj.event_id)

    logger.info(f"Validation successful for team {team_id}, activity {activity_id}")
    return team_obj, activity_obj


async def validate_admin_access(
    db: AsyncSession, team_id: int, activity_id: int
) -> tuple[Team, Activity]:
    """Validate admin access and return team and activity objects"""
    # CRUDBase.get() raises RallyNotFoundError rather than returning None, so
    # this branch is unreachable in practice; kept as a defensive guard.
    team_obj = await team.get(db, id=team_id)
    if not team_obj:
        raise RallyNotFoundError(TEAM_NOT_FOUND)

    activity_obj = await activity.get(db, id=activity_id)
    if not activity_obj:
        raise RallyNotFoundError("Activity not found")

    # Admin or not, a team scores only against its own edition's activities.
    require_same_event(team_obj.event_id, activity_obj.event_id)

    return team_obj, activity_obj


# =============================================================================
# Activity Result Management
# =============================================================================


async def check_existing_result(db: AsyncSession, activity_id: int, team_id: int) -> None:
    """Check if result already exists for this team and activity"""
    existing_result = await activity_result.get_by_activity_and_team(db, activity_id, team_id)
    if existing_result:
        raise RallyValidationError("Result already exists for this team and activity")


async def create_activity_result(
    scoring_service: ScoringService,
    team_id: int,
    activity_id: int,
    result_in: ActivityResultEvaluation,
    *,
    commit: bool = True,
) -> ActivityResult:
    """Create activity result"""
    result_create = ActivityResultCreate(
        team_id=team_id,
        activity_id=activity_id,
        result_data=result_in.result_data,
        extra_shots=result_in.extra_shots,
        # No `penalties`: the staff payload carries counts, and create_result
        # prices them. See ActivityResultEvaluation.
        penalty_counts=result_in.penalty_counts,
    )
    return await scoring_service.create_result(result_create, commit=commit)


async def create_or_update_activity_result(
    db: AsyncSession,
    scoring_service: ScoringService,
    team_id: int,
    activity_id: int,
    result_in: ActivityResultEvaluation,
    *,
    set_extra_shots_on_update: bool = True,
    editor: EvaluationEditor | None = None,
    commit: bool = True,
) -> ActivityResult:
    """Create the team's result for this activity, or update it if one already exists.

    A unique constraint on (activity_id, team_id) backs this: two concurrent
    requests can both pass the pre-check in `check_existing_result`/caller and
    race to insert, but only one INSERT wins — the loser hits IntegrityError,
    rolls back, and falls through to an update against the winner's row
    instead of leaving a duplicate.

    ``set_extra_shots_on_update=False`` leaves the existing row's extra_shots
    untouched on the update path (used when mirroring a versus result onto
    the opponent, whose extra_shots is independent of the reporting team's).

    ``editor`` is who is making the change. It must be passed whenever a person
    is behind the request: re-POSTing an evaluation overwrites an existing
    score exactly like the PUT does, and used to leave no EvaluationHistory row
    at all — a staff member could rewrite a team's points with no audit trail
    by using the endpoint they already use. It stays optional for the
    system-driven paths (versus mirroring), which have no human editor.
    """

    def _update_payload() -> ActivityResultUpdate:
        # The payload carries only the fields that should actually be written.
        # ActivityResultUpdate is consumed with exclude_unset, so a field
        # passed explicitly counts as "set" even when it is None — which is
        # why the modifiers are omitted rather than passed as None on the
        # versus-mirror path (set_extra_shots_on_update=False). That path
        # writes the opponent's *outcome*; their extra shots and penalties are
        # their own and must survive the mirror untouched.
        fields: dict[str, Any] = {"result_data": result_in.result_data}
        if set_extra_shots_on_update:
            fields["extra_shots"] = result_in.extra_shots
            if result_in.penalty_counts is not None:
                fields["penalty_counts"] = result_in.penalty_counts
        return ActivityResultUpdate(**fields)

    existing_result = await activity_result.get_by_activity_and_team(db, activity_id, team_id)
    if existing_result:
        return await scoring_service.update_result(
            existing_result, _update_payload(), editor=editor, commit=commit
        )

    try:
        if commit:
            return await create_activity_result(
                scoring_service, team_id, activity_id, result_in, commit=True
            )
        # Keep a duplicate-result INSERT from rolling back the idempotency
        # reservation and every earlier mutation in the caller's transaction.
        async with db.begin_nested():
            return await create_activity_result(
                scoring_service, team_id, activity_id, result_in, commit=False
            )
    except IntegrityError:
        if commit:
            await db.rollback()
        existing_result = await activity_result.get_by_activity_and_team(db, activity_id, team_id)
        if existing_result is None:
            raise
        return await scoring_service.update_result(
            existing_result, _update_payload(), editor=editor, commit=commit
        )


# Inverse outcome for the opponent's mirrored TeamVsActivity result.
_OPPOSITE_TEAM_VS_RESULT = {"win": "lose", "lose": "win", "draw": "draw"}


async def mirror_team_vs_result(
    db: AsyncSession,
    scoring_service: ScoringService,
    activity_obj: Activity,
    team_id: int,
    result_data: dict[str, Any],
    *,
    editor: EvaluationEditor | None = None,
    commit: bool = True,
) -> None:
    """Keep the opponent's TeamVsActivity result in sync.

    When staff marks one team as the winner/loser of a versus matchup, the
    paired team's result for the same activity should flip automatically
    instead of requiring a second, separately-entered evaluation.

    ``editor`` is the person whose evaluation caused the mirror. The write is
    automatic but it is still somebody's decision changing the opponent's
    points, and passing it through is what puts that team's flipped result in
    ``EvaluationHistory`` alongside the one that was entered by hand.
    """
    if activity_obj.activity_type != "TeamVsActivity":
        return

    opponent_team_id = result_data.get("opponent_team_id")
    own_result = result_data.get("result")
    if opponent_team_id is None or own_result not in _OPPOSITE_TEAM_VS_RESULT:
        return

    opponent_result_data = {
        **result_data,
        "opponent_team_id": team_id,
        "result": _OPPOSITE_TEAM_VS_RESULT[own_result],
    }

    await create_or_update_activity_result(
        db,
        scoring_service,
        opponent_team_id,
        activity_obj.id,
        ActivityResultEvaluation(result_data=opponent_result_data),
        set_extra_shots_on_update=False,
        editor=editor,
        commit=commit,
    )


# =============================================================================
# Team Checkpoint Progression
# =============================================================================


async def check_and_advance_team(
    db: AsyncSession, team_id: int, activity_obj: Activity, *, commit: bool = True
) -> None:
    """Advance the team past this checkpoint once ALL its activities are scored.

    Idempotent: evaluating (or re-evaluating) an activity at a checkpoint the
    team has already moved past never advances it again — otherwise each extra
    evaluation at the same checkpoint would push the team one checkpoint
    further, skipping posts it never visited.
    """
    current_checkpoint_id = activity_obj.checkpoint_id

    # Global activities (checkpoint_id is None) are not tied to a post and
    # must never drive checkpoint progression.
    if current_checkpoint_id is None:
        return

    # CRUDBase.get() raises RallyNotFoundError rather than returning None, so
    # these two guards are unreachable in practice; kept as defensive checks.
    checkpoint_obj = await checkpoint_crud.get(db, id=current_checkpoint_id)
    if not checkpoint_obj:
        return

    team_obj = await team.get(db, id=team_id)
    if not team_obj:
        return

    # Only advance once every activity at this checkpoint has a scored result.
    stmt = (
        select(ActivityResult)
        .options(joinedload(ActivityResult.activity))
        .where(ActivityResult.team_id == team_id)
    )
    team_results = list((await db.scalars(stmt)).unique().all())

    scored_activity_ids = {
        r.activity_id
        for r in team_results
        if r.activity and r.activity.checkpoint_id == current_checkpoint_id and r.is_scored
    }

    checkpoint_activities = await activity.get_by_checkpoint(
        db, checkpoint_id=current_checkpoint_id
    )
    pending = [a for a in checkpoint_activities if a.is_active and a.id not in scored_activity_ids]

    if not pending:
        logger.debug(
            f"Team {team_id} completed all activities at "
            f"checkpoint {current_checkpoint_id}, recording the visit"
        )
        await checkin_team_to_checkpoint(
            db, team_id, current_checkpoint_id, enforce_order=False, commit=commit
        )
    else:
        logger.debug(
            f"Team {team_id} still has {len(pending)} unscored activities at "
            f"checkpoint {current_checkpoint_id}, not advancing"
        )


async def checkin_team_to_checkpoint(
    db: AsyncSession,
    team_id: int,
    checkpoint_id: int,
    *,
    enforce_order: bool = True,
    arrival_already_recorded: bool = False,
    commit: bool = True,
) -> None:
    """Record that the team visited this checkpoint.

    Idempotent via the arrival row (see ``checkpoint_visits.record_visit``), so
    a re-evaluation at a post the team has already been recorded at is a no-op.

    There is no longer a second append pointing at the *next* post. Progress is
    read from what the team has actually resolved, so scoring the last activity
    here moves the pointer on by itself. The old pair — "check in, then advance"
    — wrote two entries for one post whenever anything else had already
    recorded the visit (a guide arrival, a staff scan), which walked the team
    past a post it never went to.

    ``enforce_order`` is False for callers that have already run the
    reachability check themselves.

    ``arrival_already_recorded`` is True for the arrival paths, which claim the
    arrival row themselves before deciding whether it also completes the post:
    there the row is this request's own, so treating it as "already recorded"
    dropped the visit on the floor and left ``team.times`` empty. Those callers
    run this exactly once per newly created arrival, which is what keeps it
    idempotent without a token of its own.
    """
    try:
        if arrival_already_recorded:
            await append_visit_entry(
                db,
                team_id=team_id,
                checkpoint_id=checkpoint_id,
                enforce_order=enforce_order,
                commit=commit,
            )
            recorded = True
        else:
            recorded = await record_visit(
                db,
                team_id=team_id,
                checkpoint_id=checkpoint_id,
                enforce_order=enforce_order,
                commit=commit,
            )
    except Exception as e:
        # Log error and propagate - checkpoint advancement is critical
        logger.error(f"Failed to check team {team_id} into checkpoint {checkpoint_id}: {e}")
        raise
    if recorded:
        logger.info(f"Checked team {team_id} into checkpoint {checkpoint_id}")
    else:
        logger.debug(f"Team {team_id} was already recorded at checkpoint {checkpoint_id}")


# =============================================================================
# Checkpoint Progress Calculation
# =============================================================================


async def compute_checkpoint_progress(
    db: AsyncSession, team_obj: Team, *, route: RouteSnapshot | None = None
) -> tuple[int, int | None, list[int]]:
    """(last_completed_order, current_order, resolved_orders) for a team.

    Delegates to ``route_progress.progress_for_team``, which is the whole
    point: this used to be a second, hand-maintained copy of the same scan, so
    "what the staff screen says about a team" and "what the team's own screen
    says" were two implementations that had to be kept in step by hand and
    were not. The batching parameters this took are gone with it — the engine
    loads every post's activities in one query rather than one per post.
    """
    settings = await rally_settings.get_or_create(db)
    progress = await progress_for_team(db, team_obj, settings, route=route)
    return (
        progress.last_completed_order,
        progress.current_order,
        sorted(progress.resolved_orders),
    )


async def build_team_for_staff(
    db: AsyncSession,
    team_obj: Team,
    staff_checkpoint_order: int | None = None,
    *,
    route: RouteSnapshot | None = None,
) -> dict[str, Any]:
    """Build team data for staff evaluation.

    The caller must eager-load team_obj.members (accessed below).
    """

    (
        last_checkpoint_number,
        current_checkpoint_number,
        completed_orders,
    ) = await compute_checkpoint_progress(db, team_obj, route=route)

    return {
        "id": team_obj.id,
        "name": team_obj.name,
        "total": team_obj.total,
        "classification": team_obj.classification,
        "versus_group_id": team_obj.versus_group_id,
        "num_members": len(team_obj.members) if team_obj.members else 0,
        "last_checkpoint_time": team_obj.times[-1] if team_obj.times else None,
        "last_checkpoint_score": team_obj.last_checkpoint_score,
        "last_checkpoint_number": last_checkpoint_number,
        "current_checkpoint_number": current_checkpoint_number,
        "completed_checkpoint_numbers": completed_orders,
        "evaluated_at_current_checkpoint": (
            (staff_checkpoint_order in completed_orders) if staff_checkpoint_order else False
        ),
    }
