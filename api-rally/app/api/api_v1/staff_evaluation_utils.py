"""
Utility functions for staff evaluation endpoints

This module contains helper functions for:
- Serialization of activity and team data
- Permission validation
- Team checkpoint progression and advancement
- Checkpoint progress calculation
"""

from collections.abc import Sequence
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
from app.crud.crud_team import team
from app.models.activity import Activity, ActivityResult
from app.models.checkpoint_skip import CheckpointSkip
from app.models.team import Team
from app.schemas.activity import (
    ActivityResultCreate,
    ActivityResultEvaluation,
    ActivityResultUpdate,
)
from app.schemas.team import TeamScoresUpdate
from app.schemas.user import DetailedUser
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
    return deps.is_admin(auth.scopes)


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
    return await scoring_service.create_result(result_create)


async def create_or_update_activity_result(
    db: AsyncSession,
    scoring_service: ScoringService,
    team_id: int,
    activity_id: int,
    result_in: ActivityResultEvaluation,
    *,
    set_extra_shots_on_update: bool = True,
    editor: EvaluationEditor | None = None,
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
            existing_result, _update_payload(), editor=editor
        )

    try:
        return await create_activity_result(scoring_service, team_id, activity_id, result_in)
    except IntegrityError:
        await db.rollback()
        existing_result = await activity_result.get_by_activity_and_team(db, activity_id, team_id)
        if existing_result is None:
            raise
        return await scoring_service.update_result(
            existing_result, _update_payload(), editor=editor
        )


# Inverse outcome for the opponent's mirrored TeamVsActivity result.
_OPPOSITE_TEAM_VS_RESULT = {"win": "lose", "lose": "win", "draw": "draw"}


async def mirror_team_vs_result(
    db: AsyncSession,
    scoring_service: ScoringService,
    activity_obj: Activity,
    team_id: int,
    result_data: dict[str, Any],
) -> None:
    """Keep the opponent's TeamVsActivity result in sync.

    When staff marks one team as the winner/loser of a versus matchup, the
    paired team's result for the same activity should flip automatically
    instead of requiring a second, separately-entered evaluation.
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
    )


# =============================================================================
# Team Checkpoint Progression
# =============================================================================


async def check_and_advance_team(db: AsyncSession, team_id: int, activity_obj: Activity) -> None:
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

    # Idempotency guard: len(times) counts checkpoints already reached. If the
    # team is already past this checkpoint's order, there is nothing to do.
    if len(team_obj.times) > checkpoint_obj.order:
        logger.debug(
            f"Team {team_id} already past checkpoint {current_checkpoint_id} "
            f"(order {checkpoint_obj.order}), not advancing"
        )
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
        if r.activity
        and r.activity.checkpoint_id == current_checkpoint_id
        and r.final_score is not None
    }

    checkpoint_activities = await activity.get_by_checkpoint(
        db, checkpoint_id=current_checkpoint_id
    )
    pending = [a for a in checkpoint_activities if a.is_active and a.id not in scored_activity_ids]

    if not pending:
        logger.debug(
            f"Team {team_id} completed all activities at "
            f"checkpoint {current_checkpoint_id}, advancing..."
        )
        await ensure_team_checkpoint_and_advance(db, team_id, current_checkpoint_id)
    else:
        logger.debug(
            f"Team {team_id} still has {len(pending)} unscored activities at "
            f"checkpoint {current_checkpoint_id}, not advancing"
        )


async def ensure_team_checkpoint_and_advance(
    db: AsyncSession, team_id: int, current_checkpoint_id: int
) -> None:
    """Ensure team is checked into current checkpoint and advance to next"""
    # CRUDBase.get() raises RallyNotFoundError rather than returning None, so
    # these two guards are unreachable in practice; kept as defensive checks.
    team_obj = await team.get(db, id=team_id)
    if not team_obj:
        return
    current_checkpoint_order = len(team_obj.times)

    # Convert checkpoint ID to order for comparison
    checkpoint_obj = await checkpoint_crud.get(db, id=current_checkpoint_id)
    if not checkpoint_obj:
        return

    checkpoint_order = checkpoint_obj.order

    # If team hasn't been checked into current checkpoint yet, check them in first
    if current_checkpoint_order < checkpoint_order:
        await checkin_team_to_checkpoint(db, team_id, current_checkpoint_id)

    # Now advance to next checkpoint
    await advance_team_to_next_checkpoint(db, team_id)


async def checkin_team_to_checkpoint(db: AsyncSession, team_id: int, checkpoint_id: int) -> None:
    """Check team into checkpoint with default scores"""
    checkin_scores = TeamScoresUpdate(
        checkpoint_id=checkpoint_id,
        question_score=0,  # Default score
        time_score=0,  # Default score
        pukes=0,  # Default
        skips=0,  # Default
    )

    try:
        await team.add_checkpoint(
            db=db, id=team_id, checkpoint_id=checkpoint_id, obj_in=checkin_scores
        )
        logger.info(f"Checked team {team_id} into checkpoint {checkpoint_id}")
    except Exception as e:
        # Log error and propagate - checkpoint advancement is critical
        logger.error(f"Failed to check team {team_id} into checkpoint {checkpoint_id}: {e}")
        raise


async def advance_team_to_next_checkpoint(db: AsyncSession, team_id: int) -> None:
    """Advance team to next checkpoint with default scores"""
    next_checkpoint = await checkpoint_crud.get_next(db, team_id=team_id)
    if next_checkpoint:
        advance_scores = TeamScoresUpdate(
            checkpoint_id=next_checkpoint.id,
            question_score=0,  # Default score
            time_score=0,  # Default score
            pukes=0,  # Default
            skips=0,  # Default
        )

        try:
            await team.add_checkpoint(
                db=db, id=team_id, checkpoint_id=next_checkpoint.id, obj_in=advance_scores
            )
            logger.info(f"Advanced team {team_id} to checkpoint {next_checkpoint.id}")
        except Exception as e:
            # Log error and propagate - checkpoint advancement failure should be visible
            logger.error(
                f"Failed to advance team {team_id} to checkpoint {next_checkpoint.id}: {e}"
            )
            raise


# =============================================================================
# Checkpoint Progress Calculation
# =============================================================================


async def compute_checkpoint_progress(
    db: AsyncSession, team_obj: Team
) -> tuple[int, int | None, list[int]]:
    """
    Calculate last and current checkpoint numbers plus completed orders for a team.

    Mirrors ``TeamService.compute_checkpoint_progress`` exactly (same rule for
    skips and no-activity/GPS-auto-complete checkpoints), so a staff view of a
    team's progress never diverges from what the team itself sees. A checkpoint
    without an activity used to be silently skipped here regardless of whether
    the team had actually checked in — which meant a peddy-paper post could
    never register as done for staff, and never blocked one either.
    """
    checkpoints = await checkpoint_crud.get_all_ordered(db)
    team_results = await activity_result.get_by_team(db, team_id=team_obj.id)
    completed_activity_ids = {
        r.activity_id for r in team_results if getattr(r, "is_completed", False)
    }
    skipped_ids = set(
        (
            await db.scalars(
                select(CheckpointSkip.checkpoint_id).where(CheckpointSkip.team_id == team_obj.id)
            )
        ).all()
    )
    checked_in_count = len(team_obj.times)

    last_completed_order = 0
    completed_orders: list[int] = []
    for cp in checkpoints:
        if cp.id in skipped_ids:
            last_completed_order = cp.order
            completed_orders.append(cp.order)
            continue

        cp_activities = await activity.get_by_checkpoint(db, checkpoint_id=cp.id)
        active_ids = [a.id for a in cp_activities if a.is_active]
        if not active_ids:
            # No activity to judge here: the post counts as done once the
            # team has checked in (via GPS arrival auto-complete). Otherwise
            # it is still their current, not-yet-reached post — stop here.
            if checked_in_count >= cp.order:
                last_completed_order = cp.order
                completed_orders.append(cp.order)
                continue
            break

        if all(aid in completed_activity_ids for aid in active_ids):
            last_completed_order = cp.order
            completed_orders.append(cp.order)
        else:
            # Stop at first incomplete checkpoint (teams must complete in order)
            break

    current_order = determine_current_order(checkpoints, last_completed_order)
    return last_completed_order, current_order, completed_orders


async def checkpoint_has_activities(db: AsyncSession, checkpoint_id: int) -> bool:
    return bool(await activity.get_by_checkpoint(db, checkpoint_id=checkpoint_id))


async def is_checkpoint_completed(
    db: AsyncSession, checkpoint_id: int, completed_activity_ids: set[int]
) -> bool:
    checkpoint_activities = await activity.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
    if not checkpoint_activities:
        return False
    return all(act.id in completed_activity_ids for act in checkpoint_activities)


def determine_current_order(checkpoints: Sequence[Any], last_completed_order: int) -> int | None:
    """The order of the post the team is working on, or None if there is none.

    None means the route is finished (or there is no route). Clamping to the
    last post's order instead — which this used to do — is indistinguishable
    from a team still working on that post, and it is what left a finished team
    being shown its final post as "próximo posto" forever. See
    TeamService.compute_checkpoint_progress, which carries the same rule.
    """
    if not checkpoints:
        return None
    max_order = checkpoints[-1].order
    if last_completed_order < max_order:
        return last_completed_order + 1
    return None


async def build_team_for_staff(
    db: AsyncSession, team_obj: Team, staff_checkpoint_order: int | None = None
) -> dict[str, Any]:
    """Build team data for staff evaluation.

    The caller must eager-load team_obj.members (accessed below).
    """

    (
        last_checkpoint_number,
        current_checkpoint_number,
        completed_orders,
    ) = await compute_checkpoint_progress(db, team_obj)

    return {
        "id": team_obj.id,
        "name": team_obj.name,
        "total": team_obj.total,
        "classification": team_obj.classification,
        "versus_group_id": team_obj.versus_group_id,
        "num_members": len(team_obj.members) if team_obj.members else 0,
        "last_checkpoint_time": team_obj.times[-1] if team_obj.times else None,
        "last_checkpoint_score": team_obj.score_per_checkpoint[-1]
        if team_obj.score_per_checkpoint
        else None,
        "last_checkpoint_number": last_checkpoint_number,
        "current_checkpoint_number": current_checkpoint_number,
        "completed_checkpoint_numbers": completed_orders,
        "evaluated_at_current_checkpoint": (
            (staff_checkpoint_order in completed_orders) if staff_checkpoint_order else False
        ),
    }
