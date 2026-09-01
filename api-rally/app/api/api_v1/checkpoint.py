from typing import Annotated

from fastapi import APIRouter, Depends, File, Security, UploadFile
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api import deps
from app.api.abac_deps import (
    require_checkpoint_management_permission,
    require_checkpoint_view_permission,
    validate_checkpoint_access,
)
from app.api.auth import AuthData, api_nei_auth
from app.core.exceptions import (
    RallyForbiddenError,
    RallyNotFoundError,
    RallyUnauthorizedError,
    RallyValidationError,
)
from app.crud.crud_rally_settings import rally_settings
from app.schemas.checkpoint import (
    AdminCheckPoint,
    CheckPointCreate,
    CheckPointUpdate,
    DetailedCheckPoint,
    RouteStatus,
)
from app.schemas.team import AdminCheckPointSelect, ListingTeam
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.checkpoint_service import CheckpointService
from app.services.deps import get_checkpoint_service
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store
from app.services.storage import storage_client
from app.services.visibility_policy import require_participant_view

_team_bearer = HTTPBearer(auto_error=False)

AUTH_REQUIRED = "Authentication required"


class CheckpointController:
    """REST controller for /checkpoint."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/",
            self.get_checkpoints,
            methods=["GET"],
            status_code=200,
            name="get_checkpoints",
            responses={403: {"description": "Checkpoint map is hidden"}},
        )
        self.router.add_api_route(
            "/count",
            self.get_checkpoints_count,
            methods=["GET"],
            status_code=200,
            name="get_checkpoints_count",
            responses={401: {"description": AUTH_REQUIRED}},
        )
        self.router.add_api_route(
            "/me",
            self.get_next_checkpoint,
            methods=["GET"],
            status_code=200,
            name="get_next_checkpoint",
            responses={401: {"description": f"{AUTH_REQUIRED} (User with Team or Team Token)"}},
        )
        self.router.add_api_route(
            "/teams",
            self.get_checkpoint_teams,
            methods=["GET"],
            status_code=200,
            name="get_checkpoint_teams",
            responses={401: {"description": AUTH_REQUIRED}},
        )
        self.router.add_api_route(
            "/", self.create_checkpoint, methods=["POST"], status_code=201, name="create_checkpoint"
        )
        self.router.add_api_route(
            "/reorder",
            self.reorder_checkpoints,
            methods=["PUT"],
            status_code=200,
            name="reorder_checkpoints",
        )
        self.router.add_api_route(
            "/admin/route",
            self.get_route_status,
            methods=["GET"],
            status_code=200,
            name="get_route_status",
        )
        self.router.add_api_route(
            "/{id}",
            self.update_checkpoint,
            methods=["PUT"],
            status_code=200,
            name="update_checkpoint",
        )
        self.router.add_api_route(
            "/{id}/clue-image",
            self.upload_clue_image,
            methods=["PUT"],
            status_code=200,
            name="upload_clue_image",
            responses={404: {"description": "Checkpoint not found"}},
        )
        self.router.add_api_route(
            "/{id}",
            self.delete_checkpoint,
            methods=["DELETE"],
            status_code=200,
            name="delete_checkpoint",
        )

    async def get_checkpoints(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser | None, Depends(deps.get_current_user_optional)],
        curr_team: Annotated[TeamTokenData | None, Depends(deps.get_current_team_optional)],
        service: Annotated[CheckpointService, Depends(get_checkpoint_service)],
    ) -> list[DetailedCheckPoint]:
        """Return visible checkpoints based on settings and the requesting user's role."""
        settings = await rally_settings.get_or_create(db)

        if curr_user:
            scopes = getattr(curr_user, "scopes", [])
            # Admin/staff only, matching ``/checkpoint/me``. A guide used to be
            # privileged here and redacted there, so the two endpoints
            # disagreed about the same caller — and an unassigned guide got
            # every coordinate on the route from this one.
            if deps.is_admin_or_staff(scopes):
                return await service.all_checkpoints()
            if curr_user.team_id:
                return await service.visible_checkpoints_for_team(curr_user.team_id, settings)

        if curr_team:
            return await service.visible_checkpoints_for_team(curr_team.team_id, settings)

        result = await service.visible_checkpoints_for_public(settings)
        if result is None:
            raise RallyForbiddenError("Checkpoint map is hidden")
        return result

    async def get_checkpoints_count(
        self,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser | None, Depends(deps.get_current_user_optional)] = None,
        curr_team: Annotated[TeamTokenData | None, Depends(deps.get_current_team_optional)] = None,
    ) -> int:
        """Return the total number of checkpoints."""
        if not curr_user and not curr_team:
            # Optional: Allow public access if settings permit, otherwise 401
            settings = await rally_settings.get_or_create(db)
            if not settings.public_access_enabled:
                raise RallyUnauthorizedError(AUTH_REQUIRED)

        return await crud.checkpoint.count(db=db)

    async def get_next_checkpoint(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser | None, Depends(deps.get_current_user_optional)],
        curr_team: Annotated[TeamTokenData | None, Depends(deps.get_current_team_optional)],
        service: Annotated[CheckpointService, Depends(get_checkpoint_service)],
    ) -> DetailedCheckPoint:
        """Return the next checkpoint a team must head to.

        Staff/admin bypass redaction (they run the event); a team's own
        token is redacted the same as the list endpoint — this route is not
        a way around that.
        """
        team_id = None
        is_privileged = False
        if curr_user:
            is_privileged = deps.is_admin_or_staff(getattr(curr_user, "scopes", []))
            if curr_user.team_id:
                team_id = curr_user.team_id
        if not team_id and curr_team:
            team_id = curr_team.team_id

        if not team_id:
            raise RallyUnauthorizedError(f"{AUTH_REQUIRED} (User with Team or Team Token)")

        # The next-post card is the participant view; the switch that turns
        # that view off has to close this too.
        await require_participant_view(db, is_privileged=is_privileged)

        settings = await rally_settings.get_or_create(db)
        result = await service.next_checkpoint_for_team(team_id, settings, redact=not is_privileged)
        if result is None:
            raise RallyNotFoundError("Checkpoint Not Found")
        return result

    async def get_checkpoint_teams(
        self,
        *,
        select_in: Annotated[AdminCheckPointSelect, Depends()],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        admin_or_staff_user: Annotated[DetailedUser, Depends(deps.get_admin_or_staff)],
        service: Annotated[CheckpointService, Depends(get_checkpoint_service)],
    ) -> list[ListingTeam]:
        """
        If a staff is authenticated, returned all teams that just passed
        through a staff's checkpoint.
        If an admin is authenticated, returned all teams.
        """
        # Use ABAC to validate checkpoint access
        checkpoint_id = validate_checkpoint_access(
            user=admin_or_staff_user, auth=auth, requested_checkpoint_id=select_in.checkpoint_id
        )

        # Enforce ABAC permission for viewing checkpoint teams
        require_checkpoint_view_permission(
            checkpoint_id=checkpoint_id, auth=auth, curr_user=admin_or_staff_user
        )

        is_admin_unfiltered = (
            deps.is_admin_or_manager(auth.scopes) and select_in.checkpoint_id is None
        )
        return await service.list_teams_at_checkpoint(
            checkpoint_id=checkpoint_id, is_admin_unfiltered=is_admin_unfiltered
        )

    async def create_checkpoint(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        cp_in: CheckPointCreate,
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(deps.get_participant)],
    ) -> AdminCheckPoint:
        # Enforce ABAC permission for checkpoint creation
        require_checkpoint_management_permission(auth=auth, curr_user=curr_user)

        # Validate order uniqueness
        existing_checkpoint = await crud.checkpoint.get_by_order(db=db, order=cp_in.order)
        if existing_checkpoint:
            raise RallyValidationError(f"Checkpoint with order {cp_in.order} already exists")

        cp = await crud.checkpoint.create(db=db, obj_in=cp_in, commit=True)
        # A post created straight into draft state (or a published one added
        # after existing drafts) would leave the published route with a gap.
        await crud.checkpoint.resequence(db)
        await db.refresh(cp)
        return AdminCheckPoint.model_validate(cp)

    async def reorder_checkpoints(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        checkpoint_orders: dict[int, int],
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
    ) -> dict[str, str]:
        """Reorder checkpoints by updating their order values."""
        try:
            await crud.checkpoint.reorder_checkpoints(db=db, checkpoint_orders=checkpoint_orders)
            # A reorder that interleaved drafts with published posts would
            # leave gaps in the running route; drafts always settle at the end.
            await crud.checkpoint.resequence(db)
            return {"message": "Checkpoints reordered successfully"}
        except Exception as e:
            raise RallyValidationError(f"Cannot reorder checkpoints: {str(e)}") from e

    async def update_checkpoint(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        cp_in: CheckPointUpdate,
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
        service: Annotated[CheckpointService, Depends(get_checkpoint_service)],
    ) -> AdminCheckPoint:
        await crud.checkpoint.get(db=db, id=id, for_update=True)
        # Draft state goes through the service: publishing renumbers the route
        # and is refused once teams are underway, neither of which a plain
        # column write would do.
        if cp_in.is_draft is not None:
            await service.set_draft(id, is_draft=cp_in.is_draft)
        # Rebuilt without is_draft rather than nulled: the CRUD update writes
        # every field that was *set*, so a None here would try to null a
        # NOT NULL column.
        fields = cp_in.model_dump(exclude_unset=True, exclude={"is_draft"})
        if fields.get("is_placeholder") is None:
            # Same reason: the column is NOT NULL, so an explicit null is a
            # no-op rather than a write.
            fields.pop("is_placeholder", None)
        rest = CheckPointUpdate(**fields)
        updated = await crud.checkpoint.update(db=db, id=id, obj_in=rest, commit=True)
        return AdminCheckPoint.model_validate(updated)

    async def get_route_status(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        _: Annotated[DetailedUser, Depends(deps.get_admin_or_staff)],
        service: Annotated[CheckpointService, Depends(get_checkpoint_service)],
    ) -> RouteStatus:
        """The planning view of the route: drafts included, each post with the
        fields it still lacks. Admin/staff only — it carries the staff script
        and the challenge brief, which are answers as far as a team is
        concerned.
        """
        settings = await rally_settings.get_or_create(db)
        return await service.route_status(settings)

    async def upload_clue_image(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        image: Annotated[UploadFile, File(...)],
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
    ) -> DetailedCheckPoint:
        """Upload the clue's picture-riddle to R2 and persist its URL.

        Same shape as the team-photo upload: every other image in the app is
        set this way, and expecting an admin to paste an R2 URL by hand was
        the odd one out. Replaces (and deletes) any previous clue image.
        """
        checkpoint = await crud.checkpoint.get(db=db, id=id, for_update=True)
        storage_client.delete_image(checkpoint.clue_media_url)

        url = await validate_and_store(
            image=image,
            allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
            key_prefix=f"rally/checkpoints/{id}/clue",
        )
        updated = await crud.checkpoint.update(
            db=db, id=id, obj_in=CheckPointUpdate(clue_media_url=url), commit=True
        )
        return DetailedCheckPoint.model_validate(updated)

    async def delete_checkpoint(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
        service: Annotated[CheckpointService, Depends(get_checkpoint_service)],
    ) -> dict[str, str]:
        """Delete a checkpoint. Only admins can delete checkpoints."""
        try:
            await service.delete_checkpoint(id)
            return {"message": "Checkpoint deleted successfully"}
        except Exception as e:
            await db.rollback()
            raise RallyValidationError(f"Cannot delete checkpoint: {str(e)}") from e


router = CheckpointController().router
