from typing import Annotated, Any

from fastapi import APIRouter, Depends, Security
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api import authentik_client
from app.api.abac_deps import require_team_management_permission
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_admin, get_db, get_participant
from app.core.config import SettingsDep
from app.schemas.rally_guide_assignment import RallyGuideAssignmentWithCheckpoint
from app.schemas.rally_staff_assignment import RallyStaffAssignmentWithCheckpoint
from app.schemas.user import DetailedUser
from app.services.user_service import UserService


class CheckpointAssignmentUpdate(BaseModel):
    checkpoint_id: int | None = None


class OidcUserSearchResult(BaseModel):
    """A NEI account that can be linked to a placeholder member.

    ``id`` is the local mirror user id when the account has already logged in
    (else null). ``authentik_sub`` is the stable identifier used to link.
    """

    id: int | None = None
    name: str
    email: str | None = None
    authentik_sub: str


class UserController:
    """REST controller for /user."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/search", self.search_oidc_users, methods=["GET"], name="search_oidc_users"
        )
        self.router.add_api_route(
            "/staff-assignments",
            self.get_staff_assignments,
            methods=["GET"],
            name="get_staff_assignments",
        )
        self.router.add_api_route("/me", self.get_me, methods=["GET"], name="get_me")
        self.router.add_api_route(
            "/{user_id}/checkpoint-assignment",
            self.update_checkpoint_assignment,
            methods=["PUT"],
            name="update_checkpoint_assignment",
        )
        self.router.add_api_route(
            "/guide-assignments",
            self.get_guide_assignments,
            methods=["GET"],
            name="get_guide_assignments",
        )
        self.router.add_api_route(
            "/{user_id}/guide-checkpoint-assignment",
            self.update_guide_checkpoint_assignment,
            methods=["PUT"],
            name="update_guide_checkpoint_assignment",
        )

    async def search_oidc_users(
        self,
        q: str,
        db: Annotated[AsyncSession, Depends(get_db)],
        auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        curr_user: Annotated[DetailedUser, Depends(get_participant)],
    ) -> list[OidcUserSearchResult]:
        """Search NEI accounts by name, username or email.

        When the Authentik management API is configured, searches *all* Authentik
        accounts (so people who never logged in still appear); otherwise falls back
        to accounts already mirrored locally after a first OIDC login.
        """
        require_team_management_permission(auth=auth, curr_user=curr_user)
        term = q.strip()
        if len(term) < 2:
            return []

        authentik_users = await authentik_client.search_users(term)
        if authentik_users:
            # Map known local mirrors so the UI can show their local id when present.
            subs = [u.authentik_sub for u in authentik_users]
            local = await crud.user.get_by_authentik_subs(db, authentik_subs=subs)
            local_by_sub = {u.authentik_sub: u for u in local}
            return [
                OidcUserSearchResult(
                    id=local_by_sub[u.authentik_sub].id
                    if u.authentik_sub in local_by_sub
                    else None,
                    name=u.name,
                    email=u.email,
                    authentik_sub=u.authentik_sub,
                )
                for u in authentik_users
            ]

        # Fallback: locally-mirrored users only.
        users = await crud.user.search_oidc_users(db, q=term)
        return [
            OidcUserSearchResult(id=u.id, name=u.name, email=u.email, authentik_sub=u.authentik_sub)
            for u in users
            if u.authentik_sub is not None
        ]

    async def get_staff_assignments(
        self,
        db: Annotated[AsyncSession, Depends(get_db)],
        _: Annotated[DetailedUser, Depends(get_admin)],
        settings: SettingsDep,
    ) -> list[RallyStaffAssignmentWithCheckpoint]:
        """
        Get all rally-staff users and their checkpoint assignments.

        When the Authentik management API is configured, members of the staff
        group are fetched live and mirrored locally on the fly, so an account
        shows up here as soon as it is added to the group in Authentik, with no
        prior login required. Otherwise falls back to users already mirrored
        locally (i.e. who have logged in at least once with the staff scope).
        """
        return await UserService(db).list_checkpoint_assignments(
            group=settings.OIDC_STAFF_GROUP,
            scope="rally-staff",
            assignment_crud=crud.rally_staff_assignment,
            schema=RallyStaffAssignmentWithCheckpoint,
        )

    async def get_me(
        self, auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])]
    ) -> dict[str, Any]:
        """
        Get current user information from the validated authentik token.
        """
        return {
            "oidc_sub": auth.oidc_sub,
            "name": auth.name,
            "email": auth.email,
            "scopes": auth.scopes,
            "disabled": False,
        }

    async def update_checkpoint_assignment(
        self,
        user_id: int,
        assignment: CheckpointAssignmentUpdate,
        db: Annotated[AsyncSession, Depends(get_db)],
        _: Annotated[DetailedUser, Depends(get_admin)],
    ) -> RallyStaffAssignmentWithCheckpoint:
        """
        Update a user's checkpoint assignment.
        This creates/updates Rally-specific staff assignments.
        """
        return await UserService(db).update_checkpoint_assignment(
            user_id=user_id,
            checkpoint_id=assignment.checkpoint_id,
            assignment_crud=crud.rally_staff_assignment,
            schema=RallyStaffAssignmentWithCheckpoint,
            error_message="Failed to update checkpoint assignment",
        )

    async def get_guide_assignments(
        self,
        db: Annotated[AsyncSession, Depends(get_db)],
        _: Annotated[DetailedUser, Depends(get_admin)],
        settings: SettingsDep,
    ) -> list[RallyGuideAssignmentWithCheckpoint]:
        """
        Get all rally-guide users and their checkpoint assignments.

        Mirrors the staff-assignment flow: members of the Authentik guide group
        are fetched live and mirrored locally, so an account shows up as soon as
        it is added to the group, with no prior login required.
        """
        return await UserService(db).list_checkpoint_assignments(
            group=settings.OIDC_GUIDE_GROUP,
            scope="rally-guide",
            assignment_crud=crud.rally_guide_assignment,
            schema=RallyGuideAssignmentWithCheckpoint,
        )

    async def update_guide_checkpoint_assignment(
        self,
        user_id: int,
        assignment: CheckpointAssignmentUpdate,
        db: Annotated[AsyncSession, Depends(get_db)],
        _: Annotated[DetailedUser, Depends(get_admin)],
    ) -> RallyGuideAssignmentWithCheckpoint:
        """Update a guide user's checkpoint assignment."""
        return await UserService(db).update_checkpoint_assignment(
            user_id=user_id,
            checkpoint_id=assignment.checkpoint_id,
            assignment_crud=crud.rally_guide_assignment,
            schema=RallyGuideAssignmentWithCheckpoint,
            error_message="Failed to update guide checkpoint assignment",
        )


router = UserController().router
