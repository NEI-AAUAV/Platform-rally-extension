from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, Security, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api import deps
from app.api.abac_deps import (
    require_checkpoint_score_permission,
    require_team_management_permission,
    validate_checkpoint_access,
)
from app.api.api_v1.staff_evaluation_utils import serialize_activity, serialize_team
from app.api.auth import AuthData, api_nei_auth, api_nei_auth_optional
from app.core.abac import Action, Resource, check_permission
from app.core.exceptions import (
    RallyError,
    RallyForbiddenError,
    RallyUnauthorizedError,
    RallyValidationError,
)
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_team import CRUDTeam
from app.crud.deps import get_checkpoint_crud, get_team_crud
from app.models.activity import ActivityResult
from app.models.team import Team
from app.schemas.team import (
    DetailedTeam,
    ListingTeam,
    PrivilegedDetailedTeam,
    TeamCreate,
    TeamScoresUpdate,
    TeamUpdate,
)
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.deps import get_team_service
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store
from app.services.storage import storage_client
from app.services.team_service import TeamService

_TEAM_ID_PATH = "/{id}"
AUTH_REQUIRED = "Authentication required (User or Team Token)"


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
            _TEAM_ID_PATH,
            self.get_team_by_id,
            methods=["GET"],
            status_code=200,
            name="get_team_by_id",
            responses={401: {"description": AUTH_REQUIRED}},
        )
        self.router.add_api_route(
            f"{_TEAM_ID_PATH}/checkpoint",
            self.add_checkpoint,
            methods=["PUT"],
            status_code=201,
            name="add_checkpoint",
        )
        self.router.add_api_route(
            "/", self.create_team, methods=["POST"], status_code=201, name="create_team"
        )
        self.router.add_api_route(
            _TEAM_ID_PATH, self.update_team, methods=["PUT"], status_code=200, name="update_team"
        )
        self.router.add_api_route(
            f"{_TEAM_ID_PATH}/photo",
            self.upload_team_photo,
            methods=["PUT"],
            status_code=200,
            name="upload_team_photo",
            responses={403: {"description": "Not allowed to change this team's photo"}},
        )
        self.router.add_api_route(
            _TEAM_ID_PATH, self.delete_team, methods=["DELETE"], status_code=200, name="delete_team"
        )
        self.router.add_api_route(
            f"{_TEAM_ID_PATH}/evaluations",
            self.get_team_evaluations,
            methods=["GET"],
            status_code=200,
            name="get_team_evaluations",
        )

    async def get_teams(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        service: Annotated[TeamService, Depends(get_team_service)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
    ) -> list[ListingTeam]:
        teams = await team_crud.get_multi(db)
        for team in teams:
            await db.refresh(team, ["members"])
        return [await service.build_listing_team(team) for team in teams]

    async def get_own_team(
        self,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[TeamService, Depends(get_team_service)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
    ) -> PrivilegedDetailedTeam:
        team_obj = await team_crud.get(db=db, id=curr_user.team_id)
        return await service.build_detailed_team(
            team_obj, with_progress=True, with_access_code=True
        )

    async def get_team_by_id(
        self,
        *,
        id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        auth: Annotated[AuthData | None, Depends(api_nei_auth_optional)],
        curr_user: Annotated[DetailedUser | None, Depends(deps.get_current_user_optional)],
        curr_team: Annotated[TeamTokenData | None, Depends(deps.get_current_team_optional)],
        service: Annotated[TeamService, Depends(get_team_service)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
    ) -> PrivilegedDetailedTeam:
        # Teams log in with an access code, not with OIDC, so their bearer token
        # never validates against the provider's JWKS — accept either identity
        # here or the team's own progress view (GET /team/{id} with a team
        # token) 401s. `auth` alone is enough: a valid OIDC token whose local
        # user row hasn't been mirrored yet (first request of a fresh sub)
        # leaves curr_user None but is still an authenticated caller.
        if not curr_user and not curr_team and not auth:
            raise RallyUnauthorizedError(AUTH_REQUIRED)

        # The access code is a login credential: only the team's own members and
        # callers who may manage teams (admin/staff) get it back.
        may_see_access_code = (curr_team is not None and curr_team.team_id == id) or (
            curr_user is not None
            and auth is not None
            and (
                curr_user.team_id == id
                or check_permission(curr_user, auth, Action.UPDATE_TEAM, Resource.TEAM)
            )
        )
        team_obj = await team_crud.get(db=db, id=id)
        return await service.build_detailed_team(
            team_obj, with_progress=True, with_access_code=may_see_access_code
        )

    async def add_checkpoint(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        obj_in: TeamScoresUpdate,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        staff_user: Annotated[DetailedUser, Depends(deps.get_admin_or_staff)],
        service: Annotated[TeamService, Depends(get_team_service)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
        checkpoint_crud: Annotated[CRUDCheckPoint, Depends(get_checkpoint_crud)],
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
            team_crud=team_crud,
            checkpoint_crud=checkpoint_crud,
        )

        team_db = await team_crud.add_checkpoint(
            db=db,
            id=id,
            checkpoint_id=checkpoint_id,
            obj_in=obj_in,
        )
        return await service.build_detailed_team(team_db)

    async def create_team(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        team_in: TeamCreate,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[TeamService, Depends(get_team_service)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
    ) -> PrivilegedDetailedTeam:
        # Enforce ABAC permission for team creation
        require_team_management_permission(auth=auth, curr_user=curr_user)

        team_db = await team_crud.create(db=db, obj_in=team_in, commit=True)
        # The creator needs the generated access code to hand it to the team.
        return await service.build_detailed_team(team_db, with_access_code=True)

    async def update_team(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        team_in: TeamUpdate,
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
        service: Annotated[TeamService, Depends(get_team_service)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
    ) -> DetailedTeam:
        team_db = await team_crud.update(db=db, id=id, obj_in=team_in, commit=True)
        return await service.build_detailed_team(team_db)

    async def upload_team_photo(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        image: Annotated[UploadFile, File(...)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
        service: Annotated[TeamService, Depends(get_team_service)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
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

        team = await team_crud.get(db=db, id=id)
        storage_client.delete_image(team.photo_url)

        url = await validate_and_store(
            image=image,
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix=f"rally/teams/{id}",
        )
        team_db = await team_crud.set_photo_url(db=db, id=id, url=url)
        return await service.build_detailed_team(team_db)

    async def delete_team(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
        team_crud: Annotated[CRUDTeam, Depends(get_team_crud)],
    ) -> dict[str, str]:
        """Delete a team. Only admins can delete teams."""
        try:
            # Check if team has members before deleting
            team = await team_crud.get(db=db, id=id)
            await db.refresh(team, ["members"])
            if team and len(team.members) > 0:
                raise RallyValidationError(
                    "Cannot delete team with members. Remove all members first."
                )

            await team_crud.remove(db=db, id=id, commit=True)
            return {"message": "Team deleted successfully"}
        except (HTTPException, RallyError):
            raise
        except Exception as e:
            raise RallyValidationError(f"Cannot delete team: {str(e)}") from e

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
