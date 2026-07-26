from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, Security, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api import deps
from app.api.abac_deps import (
    require_checkpoint_score_permission,
    require_team_management_permission,
    validate_checkpoint_access,
)
from app.api.auth import AuthData, api_nei_auth, api_nei_auth_optional
from app.core.abac import Action, Resource, check_permission
from app.core.exceptions import RallyError, RallyForbiddenError, RallyValidationError
from app.models.team import Team
from app.schemas.team import (
    DetailedTeam,
    ListingTeam,
    TeamCreate,
    TeamScoresUpdate,
    TeamUpdate,
)
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store
from app.services.storage import storage_client
from app.services.team_service import TeamService


class TeamController:
    """REST controller for /team."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/", self.get_teams, methods=["GET"], status_code=200, name="get_teams"
        )
        self.router.add_api_route(
            "/me", self.get_own_team, methods=["GET"], status_code=200, name="get_own_team"
        )
        self.router.add_api_route(
            "/{id}", self.get_team_by_id, methods=["GET"], status_code=200, name="get_team_by_id"
        )
        self.router.add_api_route(
            "/{id}/checkpoint",
            self.add_checkpoint,
            methods=["PUT"],
            status_code=201,
            name="add_checkpoint",
        )
        self.router.add_api_route(
            "/", self.create_team, methods=["POST"], status_code=201, name="create_team"
        )
        self.router.add_api_route(
            "/{id}", self.update_team, methods=["PUT"], status_code=200, name="update_team"
        )
        self.router.add_api_route(
            "/{id}/photo",
            self.upload_team_photo,
            methods=["PUT"],
            status_code=200,
            name="upload_team_photo",
            responses={403: {"description": "Not allowed to change this team's photo"}},
        )
        self.router.add_api_route(
            "/{id}", self.delete_team, methods=["DELETE"], status_code=200, name="delete_team"
        )
        self.router.add_api_route(
            "/{id}/evaluations",
            self.get_team_evaluations,
            methods=["GET"],
            status_code=200,
            name="get_team_evaluations",
        )

    def _team_service(self, db: AsyncSession) -> TeamService:
        return TeamService(db, crud.team)

    async def get_teams(
        self, *, db: Annotated[AsyncSession, Depends(deps.get_db)]
    ) -> list[ListingTeam]:
        service = self._team_service(db)
        teams = await crud.team.get_multi(db)
        for team in teams:
            await db.refresh(team, ["members"])
        return [await service.build_listing_team(team) for team in teams]

    async def get_own_team(
        self,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
    ) -> DetailedTeam:
        team_obj = await crud.team.get(db=db, id=curr_user.team_id)
        return await self._team_service(db).build_detailed_team(team_obj, with_progress=True)

    async def get_team_by_id(
        self,
        *,
        id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
    ) -> DetailedTeam:
        team_obj = await crud.team.get(db=db, id=id)
        return await self._team_service(db).build_detailed_team(team_obj, with_progress=True)

    async def add_checkpoint(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        obj_in: TeamScoresUpdate,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        staff_user: Annotated[DetailedUser, Depends(deps.get_admin_or_staff)],
    ) -> DetailedTeam:
        # Use ABAC to validate checkpoint access
        checkpoint_id = validate_checkpoint_access(
            user=staff_user, auth=auth, requested_checkpoint_id=obj_in.checkpoint_id
        )

        # Enforce ABAC permission for adding scores
        await require_checkpoint_score_permission(
            checkpoint_id=checkpoint_id,
            team_id=id,
            auth=auth,
            curr_user=staff_user,
            db=db,
        )

        team_db = await crud.team.add_checkpoint(
            db=db,
            id=id,
            checkpoint_id=checkpoint_id,
            obj_in=obj_in,
        )
        return await self._team_service(db).build_detailed_team(team_db)

    async def create_team(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        team_in: TeamCreate,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
    ) -> DetailedTeam:
        # Enforce ABAC permission for team creation
        require_team_management_permission(auth=auth, curr_user=curr_user)

        team_db = await crud.team.create(db=db, obj_in=team_in)
        return await self._team_service(db).build_detailed_team(team_db)

    async def update_team(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        team_in: TeamUpdate,
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
    ) -> DetailedTeam:
        team_db = await crud.team.update(db=db, id=id, obj_in=team_in)
        return await self._team_service(db).build_detailed_team(team_db)

    async def upload_team_photo(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        image: Annotated[UploadFile, File(...)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
    ) -> DetailedTeam:
        """Upload the team's official photo to R2 and persist its URL.

        Allowed for admins/managers (UPDATE_TEAM) or the captain of this team.
        Replaces any previous photo.
        """
        is_captain_of_team = bool(curr_user.is_captain) and curr_user.team_id == id
        if not is_captain_of_team and not check_permission(
            curr_user, auth, Action.UPDATE_TEAM, Resource.TEAM
        ):
            raise RallyForbiddenError("Not allowed to change this team's photo.")

        team = await crud.team.get(db=db, id=id)
        storage_client.delete_image(team.photo_url)

        url = await validate_and_store(
            image=image,
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix=f"rally/teams/{id}",
        )
        team_db = await crud.team.set_photo_url(db=db, id=id, url=url)
        return await self._team_service(db).build_detailed_team(team_db)

    async def delete_team(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
    ) -> dict[str, str]:
        """Delete a team. Only admins can delete teams."""
        try:
            # Check if team has members before deleting
            team = await crud.team.get(db=db, id=id)
            await db.refresh(team, ["members"])
            if team and len(team.members) > 0:
                raise RallyValidationError(
                    "Cannot delete team with members. Remove all members first."
                )

            await crud.team.remove(db=db, id=id)
            return {"message": "Team deleted successfully"}
        except (HTTPException, RallyError):
            raise
        except Exception as e:
            raise RallyValidationError(f"Cannot delete team: {str(e)}")

    async def get_team_evaluations(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        # Use optional auth to allow either NEI user or Team token
        current_user: Annotated[
            DetailedUser | None, Depends(deps.get_current_user_optional)
        ] = None,
        auth: Annotated[AuthData | None, Depends(api_nei_auth_optional)] = None,
        current_team: Annotated[
            TeamTokenData | None, Depends(deps.get_current_team_optional)
        ] = None,
    ) -> dict[str, Any]:
        """
        Get evaluations for a specific team.
        Accessible by:
        - The team members themselves (via Team Token or linked NEI account)
        - Staff/Admins/Managers (via NEI account)
        """
        # 1. Check if authenticated as staff/admin/manager via NEI Auth
        is_admin_or_staff = False
        if auth and auth.scopes:
            is_admin_or_staff = any(
                scope in auth.scopes for scope in ["admin", "manager-rally", "rally-staff"]
            )

        # 2. Check if authenticated as the specific team
        is_own_team = False

        # Case A: NEI User linked to team
        if current_user and current_user.team_id == id:
            is_own_team = True

        # Case B: Team Token (Simple Auth)
        if current_team and current_team.team_id == id:
            is_own_team = True

        if not (is_admin_or_staff or is_own_team):
            raise RallyForbiddenError("You do not have permission to view these evaluations")

        from sqlalchemy.orm import joinedload

        from app.api.api_v1.staff_evaluation_utils import serialize_activity, serialize_team
        from app.models.activity import ActivityResult

        # Fetch results (eager-load team.members for serialize_team)
        stmt = (
            select(ActivityResult)
            .options(
                joinedload(ActivityResult.activity),
                joinedload(ActivityResult.team).selectinload(Team.members),
            )
            .where(ActivityResult.team_id == id, ActivityResult.is_completed.is_(True))
            .order_by(ActivityResult.completed_at.desc())
        )

        results = list((await db.scalars(stmt)).unique().all())

        # Serialize results matches staff_evaluation.py format
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


router = TeamController().router
