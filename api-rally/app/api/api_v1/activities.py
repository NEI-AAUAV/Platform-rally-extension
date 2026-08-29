"""
API endpoints for activities management
"""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api import deps
from app.api.abac_deps import Action, Resource, require
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db
from app.core.abac import require_permission
from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.crud.crud_activity import activity, activity_result
from app.models.activity import ActivityResult
from app.schemas.activity import (
    ActivityCreate,
    ActivityListResponse,
    ActivityRanking,
    ActivityResponse,
    ActivityResultCreate,
    ActivityResultResponse,
    ActivityResultUpdate,
    ActivityUpdate,
    GlobalRanking,
    TeamRanking,
)
from app.schemas.user import DetailedUser
from app.services.activity_service import ActivityService
from app.services.deps import get_activity_service, get_scoring_service
from app.services.scoring_service import ScoringService

# Error message constants
ACTIVITY_NOT_FOUND = "Activity not found"
ACTIVITY_RESULT_NOT_FOUND = "Activity result not found"

ACTIVITY_ID_PATH = "/{activity_id}"


class ActivityController:
    """REST controller for /activities."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/", self.create_activity, methods=["POST"], name="create_activity"
        )
        self.router.add_api_route("/", self.get_activities, methods=["GET"], name="get_activities")
        self.router.add_api_route(
            "/results",
            self.get_all_activity_results,
            methods=["GET"],
            name="get_all_activity_results",
        )
        self.router.add_api_route(
            ACTIVITY_ID_PATH, self.get_activity, methods=["GET"], name="get_activity"
        )
        self.router.add_api_route(
            ACTIVITY_ID_PATH, self.update_activity, methods=["PUT"], name="update_activity"
        )
        self.router.add_api_route(
            ACTIVITY_ID_PATH, self.delete_activity, methods=["DELETE"], name="delete_activity"
        )
        self.router.add_api_route(
            "/results/",
            self.create_activity_result,
            methods=["POST"],
            name="create_activity_result",
        )
        self.router.add_api_route(
            "/results/{result_id}",
            self.get_activity_result,
            methods=["GET"],
            name="get_activity_result",
        )
        self.router.add_api_route(
            "/results/{result_id}",
            self.update_activity_result,
            methods=["PUT"],
            name="update_activity_result",
        )
        self.router.add_api_route(
            "/results/{result_id}/extra-shots",
            self.apply_extra_shots,
            methods=["POST"],
            name="apply_extra_shots",
        )
        self.router.add_api_route(
            "/results/{result_id}/penalty",
            self.apply_penalty,
            methods=["POST"],
            name="apply_penalty",
        )
        self.router.add_api_route(
            "/{activity_id}/ranking",
            self.get_activity_ranking,
            methods=["GET"],
            name="get_activity_ranking",
        )
        self.router.add_api_route(
            "/ranking/global",
            self.get_global_ranking,
            methods=["GET"],
            name="get_global_ranking",
        )
        self.router.add_api_route(
            "/team-vs/{activity_id}",
            self.create_team_vs_result,
            methods=["POST"],
            name="create_team_vs_result",
        )
        self.router.add_api_route(
            "/{activity_id}/statistics",
            self.get_activity_statistics,
            methods=["GET"],
            name="get_activity_statistics",
        )

    async def create_activity(
        self,
        *,
        activity_in: ActivityCreate,
        _: Annotated[None, Depends(require(Action.CREATE_ACTIVITY, Resource.ACTIVITY))],
        service: Annotated[ActivityService, Depends(get_activity_service)],
    ) -> ActivityResponse:
        """Create a new activity"""
        db_activity = await service.create_activity(activity_in)
        return ActivityResponse.model_validate(db_activity)

    async def get_activities(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        _: Annotated[None, Depends(require(Action.VIEW_ACTIVITY, Resource.ACTIVITY))],
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=1000),
        checkpoint_id: int | None = Query(None, gt=0),
    ) -> ActivityListResponse:
        """Get activities list"""
        if checkpoint_id:
            activities = await activity.get_by_checkpoint(db, checkpoint_id)
            total = len(activities)
        else:
            activities = await activity.get_multi(db, skip=skip, limit=limit)
            total = len(activities)

        return ActivityListResponse(
            activities=[ActivityResponse.model_validate(a) for a in activities],
            total=total,
            page=skip // limit + 1,
            size=limit,
        )

    async def get_all_activity_results(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        _: Annotated[None, Depends(require(Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT))],
    ) -> list[ActivityResultResponse]:
        """Get all activity results (evaluations) with team and activity details"""
        # Get all activity results with related data
        stmt = (
            select(ActivityResult)
            .options(joinedload(ActivityResult.activity), joinedload(ActivityResult.team))
            .order_by(desc(ActivityResult.completed_at))
        )
        results = list((await db.scalars(stmt)).all())

        return [ActivityResultResponse.model_validate(r) for r in results]

    async def get_activity(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        activity_id: int,
        _: Annotated[None, Depends(require(Action.VIEW_ACTIVITY, Resource.ACTIVITY))],
    ) -> ActivityResponse:
        """Get activity by ID"""
        db_activity = await activity.get(db, id=activity_id)
        if not db_activity:
            raise RallyNotFoundError(ACTIVITY_NOT_FOUND)

        return ActivityResponse.model_validate(db_activity)

    async def update_activity(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        activity_id: int,
        activity_in: ActivityUpdate,
        _: Annotated[None, Depends(require(Action.UPDATE_ACTIVITY, Resource.ACTIVITY))],
    ) -> ActivityResponse:
        """Update an activity"""
        db_activity = await activity.get(db, id=activity_id)
        if not db_activity:
            raise RallyNotFoundError(ACTIVITY_NOT_FOUND)

        db_activity = await activity.update(db=db, db_obj=db_activity, obj_in=activity_in)
        return ActivityResponse.model_validate(db_activity)

    async def delete_activity(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        activity_id: int,
        _: Annotated[None, Depends(require(Action.DELETE_ACTIVITY, Resource.ACTIVITY))],
    ) -> dict[str, str]:
        """Delete an activity and refresh the scores it was contributing to."""
        db_activity = await activity.get(db, id=activity_id)
        if not db_activity:
            raise RallyNotFoundError(ACTIVITY_NOT_FOUND)

        # Deleting an activity cascades to its results (Activity.results uses
        # delete-orphan), which silently removes points from every team that
        # was scored on it. team.total is denormalised, so without an explicit
        # recompute those points stay in the standings forever — the activity
        # is gone from the admin and its score is still on the leaderboard.
        affected_team_ids = list(
            (
                await db.scalars(
                    select(ActivityResult.team_id).where(ActivityResult.activity_id == activity_id)
                )
            ).all()
        )

        await activity.remove(db=db, id=activity_id)

        scoring_service = ScoringService(db)
        for team_id in sorted(set(affected_team_ids)):
            await scoring_service.update_team_scores(team_id)
        return {"message": "Activity deleted successfully"}

    async def _require_result_permission(
        self,
        *,
        db: AsyncSession,
        auth: AuthData,
        curr_user: DetailedUser,
        action: Action,
        activity_id: int,
    ) -> None:
        """Enforce an activity-result permission *with the post it belongs to*.

        The `require(...)` dependency deliberately carries no per-request
        context — its own docstring says endpoints that need some should call
        `require_permission` in the body, which is what this does. It matters
        here because the staff rule for these actions is `_staff_own_checkpoint`,
        which is false whenever `checkpoint_id` is None: guarding these routes
        with the context-free dependency denied *every* rally-staff member,
        including the one standing at the post with the teams in front of them.

        Resolving the checkpoint from the activity is what lets the rule mean
        what it says — staff may score at their own post and nowhere else —
        instead of collapsing to admins-only.
        """
        db_activity = await activity.get(db, id=activity_id)
        if not db_activity:
            raise RallyNotFoundError(ACTIVITY_NOT_FOUND)
        require_permission(
            curr_user,
            auth,
            action,
            Resource.ACTIVITY_RESULT,
            checkpoint_id=db_activity.checkpoint_id,
        )

    async def create_activity_result(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        result_in: ActivityResultCreate,
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_current_user)],
        service: Annotated[ScoringService, Depends(get_scoring_service)],
    ) -> ActivityResultResponse:
        """Create a new activity result"""
        await self._require_result_permission(
            db=db,
            auth=auth,
            curr_user=curr_user,
            action=Action.CREATE_ACTIVITY_RESULT,
            activity_id=result_in.activity_id,
        )

        # Check if result already exists
        existing_result = await activity_result.get_by_activity_and_team(
            db, result_in.activity_id, result_in.team_id
        )
        if existing_result:
            raise RallyValidationError("Result already exists for this team and activity")

        db_result = await service.create_result(result_in)
        return ActivityResultResponse.model_validate(db_result)

    async def get_activity_result(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        result_id: int,
        _: Annotated[None, Depends(require(Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT))],
    ) -> ActivityResultResponse:
        """Get activity result by ID"""
        db_result = await activity_result.get(db, id=result_id)
        if not db_result:
            raise RallyNotFoundError(ACTIVITY_RESULT_NOT_FOUND)

        return ActivityResultResponse.model_validate(db_result)

    async def update_activity_result(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        result_id: int,
        result_in: ActivityResultUpdate,
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_current_user)],
        service: Annotated[ScoringService, Depends(get_scoring_service)],
    ) -> ActivityResultResponse:
        """Update an activity result"""
        db_result = await activity_result.get(db, id=result_id)
        if not db_result:
            raise RallyNotFoundError(ACTIVITY_RESULT_NOT_FOUND)

        await self._require_result_permission(
            db=db,
            auth=auth,
            curr_user=curr_user,
            action=Action.UPDATE_ACTIVITY_RESULT,
            activity_id=db_result.activity_id,
        )

        db_result = await service.update_result(db_result, result_in)
        return ActivityResultResponse.model_validate(db_result)

    async def apply_extra_shots(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        result_id: int,
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_current_user)],
        service: Annotated[ScoringService, Depends(get_scoring_service)],
        extra_shots: int = Query(..., ge=0),
    ) -> dict[str, str]:
        """Apply extra shots bonus to activity result"""
        db_result = await activity_result.get(db, id=result_id)
        if not db_result:
            raise RallyNotFoundError(ACTIVITY_RESULT_NOT_FOUND)

        await self._require_result_permission(
            db=db,
            auth=auth,
            curr_user=curr_user,
            action=Action.UPDATE_ACTIVITY_RESULT,
            activity_id=db_result.activity_id,
        )

        success = await service.apply_extra_shots_bonus(
            db_result.team_id, db_result.activity_id, extra_shots
        )

        if not success:
            raise RallyValidationError("Invalid extra shots amount or team not found")

        return {"message": "Extra shots bonus applied successfully"}

    async def apply_penalty(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        result_id: int,
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_current_user)],
        service: Annotated[ScoringService, Depends(get_scoring_service)],
        penalty_type: str = Query(..., regex="^(vomit|not_drinking|other)$"),
        penalty_value: int = Query(..., ge=1),
    ) -> dict[str, str]:
        """Apply penalty to activity result"""
        db_result = await activity_result.get(db, id=result_id)
        if not db_result:
            raise RallyNotFoundError(ACTIVITY_RESULT_NOT_FOUND)

        await self._require_result_permission(
            db=db,
            auth=auth,
            curr_user=curr_user,
            action=Action.UPDATE_ACTIVITY_RESULT,
            activity_id=db_result.activity_id,
        )

        success = await service.apply_penalty(
            db_result.team_id, db_result.activity_id, penalty_type, penalty_value
        )

        if not success:
            raise RallyValidationError("Failed to apply penalty")

        return {"message": "Penalty applied successfully"}

    async def get_activity_ranking(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        activity_id: int,
        _: Annotated[None, Depends(require(Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT))],
        service: Annotated[ScoringService, Depends(get_scoring_service)],
    ) -> ActivityRanking:
        """Get ranking for a specific activity"""
        db_activity = await activity.get(db, id=activity_id)
        if not db_activity:
            raise RallyNotFoundError(ACTIVITY_NOT_FOUND)

        rankings_dict = await service.get_team_ranking(activity_id)

        return ActivityService.build_activity_ranking(
            activity_id=activity_id, activity_name=db_activity.name, rankings_dict=rankings_dict
        )

    async def get_global_ranking(
        self,
        *,
        _: Annotated[None, Depends(require(Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT))],
        service: Annotated[ScoringService, Depends(get_scoring_service)],
    ) -> GlobalRanking:
        """Get global team ranking"""
        rankings_dict = await service.get_team_ranking()

        rankings = [TeamRanking(**r) for r in rankings_dict]

        return GlobalRanking(rankings=rankings, last_updated=datetime.now(UTC))

    async def create_team_vs_result(
        self,
        *,
        activity_id: int,
        team1_id: int,
        team2_id: int,
        winner_id: int,  # 0 for draw
        match_data: dict[str, Any],
        db: Annotated[AsyncSession, Depends(get_db)],
        auth: Annotated[AuthData, Depends(api_nei_auth)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_current_user)],
        service: Annotated[ScoringService, Depends(get_scoring_service)],
    ) -> dict[str, str]:
        """Create team vs team activity results"""
        await self._require_result_permission(
            db=db,
            auth=auth,
            curr_user=curr_user,
            action=Action.CREATE_ACTIVITY_RESULT,
            activity_id=activity_id,
        )

        await service.create_team_vs_result(team1_id, team2_id, activity_id, winner_id, match_data)
        return {"message": "Team vs team results created successfully"}

    async def get_activity_statistics(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        activity_id: int,
        _: Annotated[None, Depends(require(Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT))],
        service: Annotated[ScoringService, Depends(get_scoring_service)],
    ) -> dict[str, Any]:
        """Get statistics for a specific activity"""
        db_activity = await activity.get(db, id=activity_id)
        if not db_activity:
            raise RallyNotFoundError(ACTIVITY_NOT_FOUND)

        return await service.get_activity_statistics(activity_id)


router = ActivityController().router
