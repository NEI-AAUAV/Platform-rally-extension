"""
API endpoints for staff evaluation system
"""
from typing import Annotated, List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.core.exceptions import RallyForbiddenError, RallyNotFoundError
from app.api.deps import get_db
from app.api.auth import AuthData, api_nei_auth
from app.api.abac_deps import get_staff_with_checkpoint_access
from app.schemas.user import DetailedUser
from app.crud.crud_activity import activity_result
from app.crud.crud_team import team
from app.crud.crud_checkpoint import checkpoint
from app.services.scoring_service import ScoringService
from app.schemas.activity import ActivityResultUpdate, ActivityResultResponse, ActivityResultEvaluation
from app.schemas.checkpoint import DetailedCheckPoint
from app.models.activity import ActivityResult
from app.models.team import Team

# Import utility functions
from app.api.api_v1.staff_evaluation_utils import (
    serialize_activity,
    serialize_team,
    validate_rally_permissions,
    is_admin_or_manager,
    validate_staff_checkpoint_access,
    validate_admin_access,
    check_existing_result,
    check_and_advance_team,
    build_team_for_staff,
    create_activity_result,
    mirror_team_vs_result,
    NO_CHECKPOINT_ASSIGNED,
    TEAM_NOT_FOUND,
)

router = APIRouter()

# Error message constants
TEAM_NOT_FOUND_AT_CHECKPOINT = "Team not found at your assigned checkpoint"
NO_RALLY_PERMISSIONS = "User does not have Rally permissions"


@router.get("/my-checkpoint")
async def get_my_checkpoint(
    *,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> DetailedCheckPoint:
    """Get the checkpoint assigned to the current staff member"""
    if not current_user.staff_checkpoint_id:
        raise RallyNotFoundError(NO_CHECKPOINT_ASSIGNED)

    checkpoint_obj = await checkpoint.get(db, id=current_user.staff_checkpoint_id)
    if not checkpoint_obj:
        raise RallyNotFoundError("Assigned checkpoint not found")

    return DetailedCheckPoint.model_validate(checkpoint_obj)


@router.get("/teams")
async def get_teams_at_my_checkpoint(
    *,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> List[Dict[str, Any]]:
    """Get all teams at the staff member's assigned checkpoint"""
    if not current_user.staff_checkpoint_id:
        raise RallyNotFoundError(NO_CHECKPOINT_ASSIGNED)

    # Fetch the checkpoint's order (not the FK id) for correct comparison
    from sqlalchemy import select, func
    from sqlalchemy.orm import selectinload
    checkpoint_obj = await checkpoint.get(db, id=current_user.staff_checkpoint_id)
    if not checkpoint_obj:
        raise RallyNotFoundError("Assigned checkpoint not found")
    staff_checkpoint_order = checkpoint_obj.order

    # Get all teams that staff can evaluate (at current checkpoint or previous checkpoints).
    # Eager-load members (build_team_for_staff reads team.members).
    # Scoped to the current event (legacy NULL rows count as current).
    from app.crud._event_scope import current_event_id
    event_id = await current_event_id(db)
    teams_stmt = (
        select(Team)
        .options(selectinload(Team.members))
        .where(
            func.cardinality(Team.times) <= staff_checkpoint_order,
            (Team.event_id == event_id) | (Team.event_id.is_(None)),
        )
    )
    teams = (await db.scalars(teams_stmt)).all()

    return [
        await build_team_for_staff(db, team_obj, staff_checkpoint_order=staff_checkpoint_order)
        for team_obj in teams
    ]


@router.get("/teams/{team_id}/activities")
async def get_team_activities_for_evaluation(
    *,
    db: Annotated[AsyncSession, Depends(get_db)],
    team_id: int,
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> Dict[str, Any]:
    """Get activities for a specific team that can be evaluated by this staff member"""
    if not current_user.staff_checkpoint_id:
        raise RallyNotFoundError(NO_CHECKPOINT_ASSIGNED)

    # Load team with members
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    stmt = select(Team).options(selectinload(Team.members)).where(Team.id == team_id)
    team_obj: Optional[Team] = (await db.scalars(stmt)).first()
    if not team_obj:
        raise RallyNotFoundError(TEAM_NOT_FOUND)

    team_checkpoint_number = len(team_obj.times)
    logger.debug(f"Staff {current_user.id} (checkpoint {current_user.staff_checkpoint_id}) evaluating team {team_id} (at checkpoint {team_checkpoint_number})")

    # Always show activities for the staff's assigned checkpoint
    from app.crud.crud_activity import activity
    activities = await activity.get_by_checkpoint(db, checkpoint_id=current_user.staff_checkpoint_id)

    # Get existing results for this team
    existing_results = await activity_result.get_by_team(db, team_id=team_id)
    result_map = {result.activity_id: result for result in existing_results}

    # Build response with evaluation status
    activities_with_status = []
    total_activities = len(activities)
    completed_activities = 0
    pending_activities = []

    for activity_obj in activities:
        has_result = activity_obj.id in result_map
        if has_result:
            completed_activities += 1

        existing = result_map.get(activity_obj.id)
        activity_data = {
            "id": activity_obj.id,
            "name": activity_obj.name,
            "description": activity_obj.description,
            "activity_type": activity_obj.activity_type,
            "config": activity_obj.config,
            "is_active": activity_obj.is_active,
            "evaluation_status": "completed" if has_result else "pending",
            # Serialize through the response schema so FastAPI's encoder never
            # walks the ORM's lazy relationships (activity/team) on the async
            # session, which would raise MissingGreenlet -> 500.
            "existing_result": (
                ActivityResultResponse.model_validate(existing) if existing else None
            ),
        }
        activities_with_status.append(activity_data)

        if not has_result:
            pending_activities.append(activity_obj.name)

    # Calculate completion ratio
    # Only flag as "incomplete" when some activities are already done but not
    # all — a fresh team with zero evaluations is the normal starting state,
    # not a stale/partial one, so it should not trigger the warning.
    has_incomplete = 0 < completed_activities < total_activities

    return {
        # Plain dict (not raw ORM) so the encoder doesn't lazy-load relationships.
        "team": {
            "id": team_obj.id,
            "name": team_obj.name,
            "total": team_obj.total,
            "num_members": len(team_obj.members) if team_obj.members else 0,
            "times": team_obj.times,
        },
        "activities": activities_with_status,
        "evaluation_summary": {
            "total_activities": total_activities,
            "completed_activities": completed_activities,
            "pending_activities": len(pending_activities),
            "completion_rate": round((completed_activities / total_activities * 100) if total_activities > 0 else 0, 1),
            "has_incomplete": has_incomplete,
            "missing_activities": pending_activities
        }
    }


@router.post("/teams/{team_id}/activities/{activity_id}/evaluate")
async def evaluate_team_activity(
    *,
    team_id: int,
    activity_id: int,
    result_in: ActivityResultEvaluation,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> ActivityResultResponse:
    """Evaluate a team's performance in an activity"""
    logger.info(f"Evaluation request: team_id={team_id}, activity_id={activity_id}, user_id={current_user.id}, scopes={auth.scopes}")

    # Check if user has rally permissions
    if not validate_rally_permissions(auth):
        logger.warning(f"User {current_user.id} does not have Rally permissions")
        raise RallyForbiddenError(NO_RALLY_PERMISSIONS)

    # Validate access based on user role
    is_admin_or_manager_flag = is_admin_or_manager(auth)

    try:
        if is_admin_or_manager_flag:
            _, activity_obj = await validate_admin_access(db, team_id, activity_id)
        else:
            _, activity_obj = await validate_staff_checkpoint_access(db, current_user, team_id, activity_id)
        logger.debug(f"Access validated: activity_id={activity_obj.id}, checkpoint_id={activity_obj.checkpoint_id}")
    except HTTPException as e:
        logger.error(f"Access validation failed: {e.status_code} - {e.detail}")
        raise

    # Create or update the result if it already exists
    existing_result = await activity_result.get_by_activity_and_team(db, activity_id, team_id)
    if existing_result:
        logger.info(f"Updating existing result {existing_result.id} for team {team_id}, activity {activity_id}")
        update_in = ActivityResultUpdate(
            result_data=result_in.result_data,
            extra_shots=result_in.extra_shots,
            penalties=result_in.penalties,
        )
        db_result = await ScoringService(db).update_result(existing_result, update_in)
        logger.info(f"Successfully updated result {db_result.id}")
    else:
        logger.info(f"Creating new result for team {team_id}, activity {activity_id}")
        db_result = await create_activity_result(db, team_id, activity_id, result_in)
        logger.info(f"Successfully created result {db_result.id}")

    # Mirror the result onto the opponent for TeamVsActivity matchups (win <-> lose, draw <-> draw)
    try:
        await mirror_team_vs_result(db, activity_obj, team_id, db_result.result_data or {})
    except Exception as e:
        logger.error(f"Failed to mirror versus result for team {team_id}, activity {activity_id}: {e}", exc_info=True)
        # Don't fail the evaluation if mirroring fails - it's a side effect

    # Check if team has completed all activities and advance if needed
    try:
        logger.debug(f"Checking if team {team_id} can advance after activity {activity_id}")
        await check_and_advance_team(db, team_id, activity_obj)
    except Exception as e:
        logger.error(f"Failed to check/advance team: {str(e)}", exc_info=True)
        # Don't fail the evaluation if advancement fails - advancement is a side effect

    return ActivityResultResponse.model_validate(db_result)


async def _load_activity_and_team_for_update(
    db: AsyncSession,
    *,
    team_id: int,
    activity_id: int,
    current_user: DetailedUser,
    is_manager: bool,
) -> tuple[Any, Team]:
    """Resolve+authorize the activity/team pair for an evaluation update.

    Staff are restricted to activities at their own checkpoint; managers/admins
    may update any team's activity. Raises the appropriate RallyForbidden/NotFound
    error when the target activity or team is not accessible.
    """
    from app.crud.crud_activity import activity as activity_crud

    if not is_manager and not current_user.staff_checkpoint_id:
        raise RallyForbiddenError(NO_CHECKPOINT_ASSIGNED)

    activity_obj = await activity_crud.get(db, id=activity_id)
    if not is_manager and (
        not activity_obj or activity_obj.checkpoint_id != current_user.staff_checkpoint_id
    ):
        raise RallyNotFoundError("Activity not found at your assigned checkpoint")

    team_obj = await team.get(db, id=team_id)
    if not team_obj:
        raise RallyNotFoundError(TEAM_NOT_FOUND)

    return activity_obj, team_obj


@router.put("/teams/{team_id}/activities/{activity_id}/evaluate/{result_id}")
async def update_team_activity_evaluation(
    *,
    db: Annotated[AsyncSession, Depends(get_db)],
    team_id: int,
    activity_id: int,
    result_id: int,
    result_in: ActivityResultUpdate,
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> ActivityResultResponse:
    """Update a team's activity evaluation"""
    if not validate_rally_permissions(auth):
        raise RallyForbiddenError(NO_RALLY_PERMISSIONS)

    is_manager = is_admin_or_manager(auth)
    activity_obj, _team_obj = await _load_activity_and_team_for_update(
        db,
        team_id=team_id,
        activity_id=activity_id,
        current_user=current_user,
        is_manager=is_manager,
    )

    # Get the result
    db_result = await activity_result.get(db, id=result_id)
    if not db_result or db_result.activity_id != activity_id or db_result.team_id != team_id:
        raise RallyNotFoundError("Activity result not found")

    # Update the result
    db_result = await ScoringService(db).update_result(db_result, result_in)

    # Mirror the result onto the opponent for TeamVsActivity matchups (win <-> lose, draw <-> draw)
    try:
        if activity_obj:
            await mirror_team_vs_result(db, activity_obj, team_id, db_result.result_data or {})
    except Exception as e:
        logger.error(f"Failed to mirror versus result for team {team_id}, activity {activity_id}: {e}", exc_info=True)

    return ActivityResultResponse.model_validate(db_result)


@router.get("/all-evaluations")
async def get_all_evaluations(
    *,
    db: Annotated[AsyncSession, Depends(get_db)],
    checkpoint_id: Annotated[Optional[int], Query()] = None,
    team_id: Annotated[Optional[int], Query()] = None,
    current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
    auth: Annotated[AuthData, Depends(api_nei_auth)]
) -> Dict[str, Any]:
    """Get all evaluations - accessible by staff (filtered by checkpoint) and managers (all data)"""
    # Check if user has rally permissions
    if not validate_rally_permissions(auth):
        raise RallyForbiddenError(NO_RALLY_PERMISSIONS)

    # Staff members can only view evaluations from their assigned checkpoint
    is_manager = is_admin_or_manager(auth)

    if not is_manager:
        if not current_user.staff_checkpoint_id:
            raise RallyNotFoundError(NO_CHECKPOINT_ASSIGNED)
        # Override checkpoint_id filter with staff's assigned checkpoint
        checkpoint_id = current_user.staff_checkpoint_id
        logger.debug(f"Staff user {current_user.id} restricted to checkpoint {checkpoint_id}")

    # Get all activity results. Eager-load activity and team (+ team.members for
    # serialize_team) to avoid lazy loads on the async session.
    from sqlalchemy.orm import joinedload, selectinload
    from sqlalchemy import select
    stmt = select(ActivityResult).options(
        joinedload(ActivityResult.activity),
        joinedload(ActivityResult.team).selectinload(Team.members)
    )

    if team_id:
        # Filter by specific team
        stmt = stmt.where(ActivityResult.team_id == team_id)
    elif checkpoint_id:
        # Get teams at specific checkpoint
        teams = await team.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
        team_ids = [t.id for t in teams]

        # Get results for these teams
        stmt = stmt.where(ActivityResult.team_id.in_(team_ids))

    stmt = stmt.order_by(ActivityResult.completed_at.desc())
    results = list((await db.scalars(stmt)).unique().all())

    # Build response with team and activity details
    evaluations = []
    for result in results:
        evaluation_data = {
            "id": result.id,
            "activity_id": result.activity_id,
            "team_id": result.team_id,
            "result_data": result.result_data,
            "final_score": result.final_score,
            "is_completed": result.is_completed,
            "completed_at": result.completed_at,
            "created_at": result.created_at,
            "updated_at": result.updated_at,
            "extra_shots": result.extra_shots,
            "penalties": result.penalties,
            "time_score": result.time_score,
            "points_score": result.points_score,
            "boolean_score": result.boolean_score,
            "activity": serialize_activity(result) if result.activity else None,
            "team": serialize_team(result) if result.team else None
        }
        evaluations.append(evaluation_data)

    return {
        "evaluations": evaluations,
        "total": len(evaluations)
    }
