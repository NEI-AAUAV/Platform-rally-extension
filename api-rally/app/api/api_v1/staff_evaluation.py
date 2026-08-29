"""
API endpoints for staff evaluation system
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.abac_deps import get_staff_with_checkpoint_access
from app.api.api_v1.idempotency import (
    compute_fingerprint,
    reserve_idempotency_key,
    store_idempotent_response,
)

# Import utility functions
from app.api.api_v1.staff_evaluation_utils import (
    NO_CHECKPOINT_ASSIGNED,
    TEAM_NOT_FOUND,
    build_team_for_staff,
    check_and_advance_team,
    create_or_update_activity_result,
    is_admin_or_manager,
    mirror_team_vs_result,
    serialize_activity,
    serialize_team,
    validate_admin_access,
    validate_rally_permissions,
    validate_staff_checkpoint_access,
)
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db
from app.core.exceptions import RallyForbiddenError, RallyNotFoundError
from app.crud import current_event_id
from app.crud.crud_activity import CRUDActivity, CRUDActivityResult
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import CRUDTeam
from app.crud.deps import (
    get_activity_crud,
    get_activity_result_crud,
    get_checkpoint_crud,
    get_team_crud,
)
from app.models.activity import Activity, ActivityResult
from app.models.evaluation_history import EvaluationHistory
from app.models.team import Team
from app.schemas.activity import (
    ActivityResultEvaluation,
    ActivityResultResponse,
    ActivityResultUpdate,
)
from app.schemas.checkpoint import DetailedCheckPoint
from app.schemas.evaluation_history import EvaluationHistoryEntry
from app.schemas.user import DetailedUser
from app.services.deps import get_scoring_service
from app.services.scoring_service import EvaluationEditor, ScoringService

_EVALUATE_ENDPOINT = "evaluate_team_activity"

# Error message constants
TEAM_NOT_FOUND_AT_CHECKPOINT = "Team not found at your assigned checkpoint"
NO_RALLY_PERMISSIONS = "User does not have Rally permissions"
STAFF_SCORING_DISABLED = (
    "Staff scoring is disabled for this event. Only an admin or manager can "
    "record or edit evaluations."
)


async def _require_staff_scoring_enabled(db: Any, is_admin_or_manager_flag: bool) -> None:
    """Block staff (non admin/manager) when ``enable_staff_scoring`` is off.

    Admins and managers keep write access so they can still correct results
    while the master switch is disabled in the admin UI.
    """
    if is_admin_or_manager_flag:
        return
    rally_config = await rally_settings.get_or_create(db)
    if not rally_config.enable_staff_scoring:
        raise RallyForbiddenError(STAFF_SCORING_DISABLED)


def _build_activity_status_list(
    activities: list[Activity], result_map: dict[int, ActivityResult]
) -> tuple[list[dict[str, Any]], int, list[str]]:
    """Build per-activity evaluation status entries plus completion bookkeeping."""
    activities_with_status = []
    completed_activities = 0
    pending_activities = []

    for activity_obj in activities:
        existing = result_map.get(activity_obj.id)
        has_result = existing is not None
        if has_result:
            completed_activities += 1
        else:
            pending_activities.append(activity_obj.name)

        activities_with_status.append(
            {
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
        )

    return activities_with_status, completed_activities, pending_activities


class StaffEvaluationController:
    """REST controller for staff/manager activity evaluation."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/my-checkpoint", self.get_my_checkpoint, methods=["GET"], name="get_my_checkpoint"
        )
        self.router.add_api_route(
            "/teams",
            self.get_teams_at_my_checkpoint,
            methods=["GET"],
            name="get_teams_at_my_checkpoint",
        )
        self.router.add_api_route(
            "/teams/{team_id}/activities",
            self.get_team_activities_for_evaluation,
            methods=["GET"],
            name="get_team_activities_for_evaluation",
        )
        self.router.add_api_route(
            "/teams/{team_id}/activities/{activity_id}/evaluate",
            self.evaluate_team_activity,
            methods=["POST"],
            name="evaluate_team_activity",
        )
        self.router.add_api_route(
            "/teams/{team_id}/activities/{activity_id}/evaluate/{result_id}",
            self.update_team_activity_evaluation,
            methods=["PUT"],
            name="update_team_activity_evaluation",
        )
        self.router.add_api_route(
            "/evaluations/{result_id}/history",
            self.get_evaluation_history,
            methods=["GET"],
            name="get_evaluation_history",
        )
        self.router.add_api_route(
            "/all-evaluations",
            self.get_all_evaluations,
            methods=["GET"],
            name="get_all_evaluations",
        )

    async def get_my_checkpoint(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        checkpoint_crud: Annotated[CRUDCheckPoint, Depends(get_checkpoint_crud)],
    ) -> DetailedCheckPoint:
        """Get the checkpoint assigned to the current staff member"""
        if not current_user.staff_checkpoint_id:
            raise RallyNotFoundError(NO_CHECKPOINT_ASSIGNED)

        # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
        # rather than returning None, so this branch is unreachable in practice;
        # kept as a defensive guard.
        checkpoint_obj = await checkpoint_crud.get(db, id=current_user.staff_checkpoint_id)
        if not checkpoint_obj:
            raise RallyNotFoundError("Assigned checkpoint not found")

        return DetailedCheckPoint.model_validate(checkpoint_obj)

    async def get_teams_at_my_checkpoint(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        checkpoint_crud: Annotated[CRUDCheckPoint, Depends(get_checkpoint_crud)],
    ) -> list[dict[str, Any]]:
        """Get all teams at the staff member's assigned checkpoint"""
        if not current_user.staff_checkpoint_id:
            raise RallyNotFoundError(NO_CHECKPOINT_ASSIGNED)

        # Fetch the checkpoint's order (not the FK id) for correct comparison
        # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
        # rather than returning None, so this branch is unreachable in practice;
        # kept as a defensive guard.
        checkpoint_obj = await checkpoint_crud.get(db, id=current_user.staff_checkpoint_id)
        if not checkpoint_obj:
            raise RallyNotFoundError("Assigned checkpoint not found")
        staff_checkpoint_order = checkpoint_obj.order

        # Get all teams that staff can evaluate (at current checkpoint or previous checkpoints).
        # Eager-load members (build_team_for_staff reads team.members).
        # Scoped to the current event (legacy NULL rows count as current).
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

    async def _resolve_admin_checkpoint_id(
        self,
        db: AsyncSession,
        team_checkpoint_number: int,
        *,
        checkpoint_crud: CRUDCheckPoint,
        activity_crud: CRUDActivity,
    ) -> int:
        """Resolve the checkpoint an admin/manager should see activities for.

        The team's most recently reached checkpoint (order == len(times)) is
        where they currently stand and where staff evaluate them — not
        get_next()'s order+1, which is the checkpoint still ahead of them
        and 404s once the team has already checked into their last post.
        Checkpoints are numbered starting at 1, so a team with no visits
        yet (len(times) == 0) stands at the first checkpoint, not order 0.

        But evaluating the *last* pending activity at a checkpoint makes
        check_and_advance_team auto-advance the team past it in the same
        request (staff_evaluation_utils.py's ensure_team_checkpoint_and_advance),
        so by the time this GET runs right after that evaluate,
        len(times) already reflects the *next* checkpoint — order+1 relative
        to where the just-scored activity actually lives. Try the team's
        current order first; if it has no activities for this team (no
        pending ones, no prior results), assume they just completed and
        advanced past it, and fall back one order to show what was just
        evaluated instead of an empty list.
        """
        checkpoint_obj = await checkpoint_crud.get_by_order(
            db, order=max(team_checkpoint_number, 1)
        )
        resolved_checkpoint_id = checkpoint_obj.id if checkpoint_obj else None

        checkpoint_activities_preview = (
            await activity_crud.get_by_checkpoint(db, checkpoint_id=resolved_checkpoint_id)
            if resolved_checkpoint_id is not None
            else []
        )
        # No checkpoint at the team's current order, or it has nothing pending:
        # either way this can mean the team just advanced past their last
        # checkpoint in this event (e.g. a single-checkpoint event), so fall back
        # one order to show what was just evaluated instead of 404ing.
        if (not checkpoint_obj or not checkpoint_activities_preview) and team_checkpoint_number > 1:
            previous_checkpoint = await checkpoint_crud.get_by_order(
                db, order=team_checkpoint_number - 1
            )
            if previous_checkpoint:
                resolved_checkpoint_id = previous_checkpoint.id

        if resolved_checkpoint_id is None:
            raise RallyNotFoundError("Checkpoint not found")

        return resolved_checkpoint_id

    async def get_team_activities_for_evaluation(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        team_id: int,
        current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        checkpoint_crud: Annotated[CRUDCheckPoint, Depends(get_checkpoint_crud)],
        activity_crud: Annotated[CRUDActivity, Depends(get_activity_crud)],
        activity_result_crud: Annotated[CRUDActivityResult, Depends(get_activity_result_crud)],
    ) -> dict[str, Any]:
        """Get activities for a specific team that can be evaluated by this staff member"""
        # Load team with members
        stmt = select(Team).options(selectinload(Team.members)).where(Team.id == team_id)
        team_obj: Team | None = (await db.scalars(stmt)).first()
        if not team_obj:
            raise RallyNotFoundError(TEAM_NOT_FOUND)

        team_checkpoint_number = len(team_obj.times)

        # Admins/managers aren't tied to a single checkpoint (staff_checkpoint_id is
        # only ever populated for rally-staff scope, mirroring evaluate_team_activity's
        # is_admin_or_manager bypass at line ~238) — resolve the team's current
        # checkpoint from its progress instead of requiring a staff assignment.
        if is_admin_or_manager(auth):
            resolved_checkpoint_id = await self._resolve_admin_checkpoint_id(
                db,
                team_checkpoint_number,
                checkpoint_crud=checkpoint_crud,
                activity_crud=activity_crud,
            )
        else:
            if not current_user.staff_checkpoint_id:
                raise RallyNotFoundError(NO_CHECKPOINT_ASSIGNED)
            resolved_checkpoint_id = current_user.staff_checkpoint_id

        logger.debug(
            f"Staff {current_user.id} (checkpoint {resolved_checkpoint_id}) "
            f"evaluating team {team_id} (at checkpoint {team_checkpoint_number})"
        )

        # Always show activities for the resolved checkpoint
        activities = await activity_crud.get_by_checkpoint(db, checkpoint_id=resolved_checkpoint_id)

        # Get existing results for this team
        existing_results = await activity_result_crud.get_by_team(db, team_id=team_id)
        result_map = {result.activity_id: result for result in existing_results}

        total_activities = len(activities)
        activities_with_status, completed_activities, pending_activities = (
            _build_activity_status_list(activities, result_map)
        )

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
                "completion_rate": round(
                    (completed_activities / total_activities * 100) if total_activities > 0 else 0,
                    1,
                ),
                "has_incomplete": has_incomplete,
                "missing_activities": pending_activities,
            },
        }

    async def evaluate_team_activity(
        self,
        *,
        team_id: int,
        activity_id: int,
        result_in: ActivityResultEvaluation,
        db: Annotated[AsyncSession, Depends(get_db)],
        scoring_service: Annotated[ScoringService, Depends(get_scoring_service)],
        current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    ) -> ActivityResultResponse:
        """Evaluate a team's performance in an activity.

        Accepts an optional ``Idempotency-Key`` header. When present, a retry of the
        same logical submit (same key + payload) replays the stored response instead
        of re-scoring; a reused key with a different payload is rejected with 409.
        Submits without a key behave exactly as before.
        """
        logger.info(
            f"Evaluation request: team_id={team_id}, activity_id={activity_id}, "
            f"user_id={current_user.id}, scopes={auth.scopes}"
        )

        # NOTE: `get_staff_with_checkpoint_access` (this endpoint's `current_user`
        # dependency) already enforces `is_admin_or_staff`, the same check
        # `validate_rally_permissions` performs, so this branch is unreachable in
        # practice; kept as a defensive guard/explicit precondition.
        if not validate_rally_permissions(auth):
            logger.warning(f"User {current_user.id} does not have Rally permissions")
            raise RallyForbiddenError(NO_RALLY_PERMISSIONS)

        # Validate access based on user role
        is_admin_or_manager_flag = is_admin_or_manager(auth)

        await _require_staff_scoring_enabled(db, is_admin_or_manager_flag)

        try:
            if is_admin_or_manager_flag:
                _, activity_obj = await validate_admin_access(db, team_id, activity_id)
            else:
                _, activity_obj = await validate_staff_checkpoint_access(
                    db, current_user, team_id, activity_id
                )
            logger.debug(
                f"Access validated: activity_id={activity_obj.id}, "
                f"checkpoint_id={activity_obj.checkpoint_id}"
            )
        except HTTPException as e:
            logger.error(f"Access validation failed: {e.status_code} - {e.detail}")
            raise

        # Idempotency gate: replay a prior identical submit, or reserve this key so a
        # retry (e.g. from the client offline queue) can't double-apply scoring.
        reservation = None
        if idempotency_key:
            fingerprint = compute_fingerprint(
                {
                    "team_id": team_id,
                    "activity_id": activity_id,
                    "body": result_in.model_dump(),
                }
            )
            reservation = await reserve_idempotency_key(
                db,
                endpoint=_EVALUATE_ENDPOINT,
                key=idempotency_key,
                fingerprint=fingerprint,
            )
            if reservation.replay is not None:
                logger.info(
                    f"Replaying idempotent evaluation for key={idempotency_key}, "
                    f"team={team_id}, activity={activity_id}"
                )
                return ActivityResultResponse.model_validate(reservation.replay)

        # Create or update the result if it already exists. Handles the race
        # where two concurrent requests both see no existing result and try to
        # insert — the loser falls back to an update instead of duplicating.
        # Tag the audit trail with who evaluated. A re-POST overwrites an
        # existing score exactly like the PUT does, so it has to leave the same
        # EvaluationHistory row — without this, re-submitting was an untracked
        # way to rewrite a team's points.
        db_result = await create_or_update_activity_result(
            db,
            scoring_service,
            team_id,
            activity_id,
            result_in,
            editor=EvaluationEditor(id=str(current_user.id), name=current_user.name),
        )
        logger.info(
            f"Evaluation result {db_result.id} saved for team {team_id}, activity {activity_id}"
        )

        # Mirror the result onto the opponent for TeamVsActivity matchups (win
        # <-> lose, draw <-> draw)
        try:
            await mirror_team_vs_result(
                db, scoring_service, activity_obj, team_id, db_result.result_data or {}
            )
        except Exception:
            # loguru's `.error(..., exc_info=True)` does NOT attach a
            # traceback (exc_info is stdlib-only); `.exception()` does.
            logger.exception(
                f"Failed to mirror versus result for team {team_id}, activity {activity_id}"
            )
            # Don't fail the evaluation if mirroring fails - it's a side effect

        # Check if team has completed all activities and advance if needed
        try:
            logger.debug(f"Checking if team {team_id} can advance after activity {activity_id}")
            await check_and_advance_team(db, team_id, activity_obj)
        except Exception:
            logger.exception(f"Failed to check/advance team {team_id}")
            # Don't fail the evaluation if advancement fails - advancement is a side effect

        response = ActivityResultResponse.model_validate(db_result)

        # Persist the response against the reserved key so retries replay it.
        if reservation is not None:
            await store_idempotent_response(
                db, reservation, response_body=response.model_dump(mode="json")
            )

        return response

    async def _load_activity_and_team_for_update(
        self,
        db: AsyncSession,
        *,
        team_id: int,
        activity_id: int,
        current_user: DetailedUser,
        is_manager: bool,
        activity_crud: CRUDActivity,
        team_crud: CRUDTeam,
    ) -> tuple[Any, Team]:
        """Resolve+authorize the activity/team pair for an evaluation update.

        Staff are restricted to activities at their own checkpoint; managers/admins
        may update any team's activity. Raises the appropriate RallyForbidden/NotFound
        error when the target activity or team is not accessible.
        """
        # NOTE: the only caller, `update_team_activity_evaluation`, depends on
        # `get_staff_with_checkpoint_access`, which already 403s a staff user with
        # no assigned checkpoint — so this branch is unreachable in practice;
        # kept as a defensive guard/explicit precondition.
        if not is_manager and not current_user.staff_checkpoint_id:
            raise RallyForbiddenError(NO_CHECKPOINT_ASSIGNED)

        activity_obj = await activity_crud.get(db, id=activity_id)
        if not is_manager and (
            not activity_obj or activity_obj.checkpoint_id != current_user.staff_checkpoint_id
        ):
            raise RallyNotFoundError("Activity not found at your assigned checkpoint")

        # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
        # rather than returning None, so this branch is unreachable in practice;
        # kept as a defensive guard.
        team_obj = await team_crud.get(db, id=team_id)
        if not team_obj:
            raise RallyNotFoundError(TEAM_NOT_FOUND)

        return activity_obj, team_obj

    async def update_team_activity_evaluation(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        scoring_service: Annotated[ScoringService, Depends(get_scoring_service)],
        team_id: int,
        activity_id: int,
        result_id: int,
        result_in: ActivityResultUpdate,
        current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        activity_crud: Annotated[CRUDActivity, Depends(get_activity_crud)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
        activity_result_crud: Annotated[CRUDActivityResult, Depends(get_activity_result_crud)],
    ) -> ActivityResultResponse:
        """Update a team's activity evaluation"""
        # NOTE: `get_staff_with_checkpoint_access` (this endpoint's `current_user`
        # dependency) already enforces `is_admin_or_staff`, the same check
        # `validate_rally_permissions` performs, so this branch is unreachable in
        # practice; kept as a defensive guard/explicit precondition.
        if not validate_rally_permissions(auth):
            raise RallyForbiddenError(NO_RALLY_PERMISSIONS)

        is_manager = is_admin_or_manager(auth)
        await _require_staff_scoring_enabled(db, is_manager)
        activity_obj, _team_obj = await self._load_activity_and_team_for_update(
            db,
            team_id=team_id,
            activity_id=activity_id,
            current_user=current_user,
            is_manager=is_manager,
            activity_crud=activity_crud,
            team_crud=team_crud,
        )

        # Get the result
        db_result = await activity_result_crud.get(db, id=result_id)
        if not db_result or db_result.activity_id != activity_id or db_result.team_id != team_id:
            raise RallyNotFoundError("Activity result not found")

        # Update the result, tagging the audit trail with who made the change.
        editor = EvaluationEditor(id=str(current_user.id), name=current_user.name)
        db_result = await scoring_service.update_result(db_result, result_in, editor=editor)

        # Mirror the result onto the opponent for TeamVsActivity matchups (win
        # <-> lose, draw <-> draw)
        try:
            if activity_obj:
                await mirror_team_vs_result(
                    db, scoring_service, activity_obj, team_id, db_result.result_data or {}
                )
        except Exception:
            logger.exception(
                f"Failed to mirror versus result for team {team_id}, activity {activity_id}"
            )

        return ActivityResultResponse.model_validate(db_result)

    async def get_evaluation_history(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        result_id: int,
        current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        activity_result_crud: Annotated[CRUDActivityResult, Depends(get_activity_result_crud)],
    ) -> list[EvaluationHistoryEntry]:
        """Audit trail for a single result: every edit and contest, newest first.

        Manager/admin only — staff can score but the trail (who overrode whom) is a
        dispute-resolution tool for organizers.
        """
        # NOTE: `get_staff_with_checkpoint_access` (this endpoint's `current_user`
        # dependency) already enforces `is_admin_or_staff`, the same check
        # `validate_rally_permissions` performs, so this branch is unreachable in
        # practice; kept as a defensive guard/explicit precondition.
        if not validate_rally_permissions(auth):
            raise RallyForbiddenError(NO_RALLY_PERMISSIONS)
        if not is_admin_or_manager(auth):
            raise RallyForbiddenError("Only managers can view evaluation history")

        db_result = await activity_result_crud.get(db, id=result_id)
        if not db_result:
            raise RallyNotFoundError("Activity result not found")

        stmt = (
            select(EvaluationHistory)
            .where(EvaluationHistory.result_id == result_id)
            .order_by(EvaluationHistory.created_at.desc())
        )
        rows = (await db.scalars(stmt)).all()
        return [EvaluationHistoryEntry.model_validate(row) for row in rows]

    async def get_all_evaluations(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        checkpoint_id: Annotated[int | None, Query()] = None,
        team_id: Annotated[int | None, Query()] = None,
        current_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
    ) -> dict[str, Any]:
        """Get all evaluations.

        Accessible by staff (filtered to their checkpoint) and by managers
        (all data).
        """
        # Check if user has rally permissions
        # NOTE: `get_staff_with_checkpoint_access` (this endpoint's `current_user`
        # dependency) already enforces `is_admin_or_staff`, the same check
        # `validate_rally_permissions` performs, so this branch is unreachable in
        # practice; kept as a defensive guard/explicit precondition.
        if not validate_rally_permissions(auth):
            raise RallyForbiddenError(NO_RALLY_PERMISSIONS)

        # Staff members can only view evaluations from their assigned checkpoint
        is_manager = is_admin_or_manager(auth)

        if not is_manager:
            # NOTE: only a non-manager (staff) reaches this branch, and
            # `get_staff_with_checkpoint_access` already 403s a staff user with no
            # assigned checkpoint — so this is unreachable in practice; kept as a
            # defensive guard.
            if not current_user.staff_checkpoint_id:
                raise RallyNotFoundError(NO_CHECKPOINT_ASSIGNED)
            # Override checkpoint_id filter with staff's assigned checkpoint
            checkpoint_id = current_user.staff_checkpoint_id
            logger.debug(f"Staff user {current_user.id} restricted to checkpoint {checkpoint_id}")

        # Get all activity results. Eager-load activity and team (+ team.members for
        # serialize_team) to avoid lazy loads on the async session.

        stmt = select(ActivityResult).options(
            joinedload(ActivityResult.activity),
            joinedload(ActivityResult.team).selectinload(Team.members),
        )

        # Filters are conjunctive: a staff caller's checkpoint clamp must survive
        # even when team_id is also supplied.
        if team_id:
            stmt = stmt.where(ActivityResult.team_id == team_id)
        if checkpoint_id:
            # Get teams at specific checkpoint
            teams = await team_crud.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
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
                "team": serialize_team(result) if result.team else None,
            }
            evaluations.append(evaluation_data)

        return {"evaluations": evaluations, "total": len(evaluations)}


router = StaffEvaluationController().router
