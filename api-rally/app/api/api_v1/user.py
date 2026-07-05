from typing import Annotated, List, Dict, Any
from fastapi import APIRouter, Depends, Security
from app.core.exceptions import RallyValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from sqlalchemy import select, text

from app import crud
from app.api import authentik_client
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_admin, get_participant
from app.api.abac_deps import require_team_management_permission
from app.core.config import settings
from app.schemas.user import DetailedUser
from app.schemas.rally_staff_assignment import RallyStaffAssignmentWithCheckpoint
from app.schemas.rally_guide_assignment import RallyGuideAssignmentWithCheckpoint
from app.models.user import User

router = APIRouter()


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


@router.get("/search")
async def search_oidc_users(
    q: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
) -> List[OidcUserSearchResult]:
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
                id=local_by_sub[u.authentik_sub].id if u.authentik_sub in local_by_sub else None,
                name=u.name,
                email=u.email,
                authentik_sub=u.authentik_sub,
            )
            for u in authentik_users
        ]

    # Fallback: locally-mirrored users only.
    users = await crud.user.search_oidc_users(db, q=term)
    return [
        OidcUserSearchResult(
            id=u.id, name=u.name, email=u.email, authentik_sub=u.authentik_sub
        )
        for u in users
        if u.authentik_sub is not None
    ]


@router.get("/staff-assignments")
async def get_staff_assignments(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[DetailedUser, Depends(get_admin)],
) -> List[RallyStaffAssignmentWithCheckpoint]:
    """
    Get all rally-staff users and their checkpoint assignments.

    When the Authentik management API is configured, members of the staff
    group are fetched live and mirrored locally on the fly, so an account
    shows up here as soon as it is added to the group in Authentik, with no
    prior login required. Otherwise falls back to users already mirrored
    locally (i.e. who have logged in at least once with the staff scope).
    """
    group_members = await authentik_client.list_group_members(settings.OIDC_STAFF_GROUP)
    for member in group_members:
        await crud.user.get_or_create_mirror(
            db,
            name=member.name,
            email=member.email,
            scope="rally-staff",
        )

    stmt = select(User).where(User.scopes.contains(['rally-staff']))
    rally_staff_users = (await db.scalars(stmt)).all()

    # Get existing assignments
    existing_assignments = await crud.rally_staff_assignment.get_multi_with_checkpoint(db)
    assignment_map = {assignment.user_id: assignment for assignment in existing_assignments}

    # Build result list with all rally-staff users
    result = []
    for user in rally_staff_users:
        user_id = user.id
        assignment = assignment_map.get(user_id)

        if assignment:
            assignment_data = {
                "id": assignment.id,
                "user_id": user_id,
                "user_name": user.name,
                "user_email": user.email,
                "checkpoint_id": assignment.checkpoint_id,
                "checkpoint_name": assignment.checkpoint.name if assignment.checkpoint else None,
                "checkpoint_description": assignment.checkpoint.description if assignment.checkpoint else None,
            }
        else:
            assignment_data = {
                "id": 0,  # Temporary ID for unassigned users
                "user_id": user_id,
                "user_name": user.name,
                "user_email": user.email,
                "checkpoint_id": None,
                "checkpoint_name": None,
                "checkpoint_description": None,
            }

        result.append(RallyStaffAssignmentWithCheckpoint(**assignment_data))

    return result


@router.get("/me")
async def get_me(auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])]) -> Dict[str, Any]:
    """
    Get current user information from the validated authentik token.
    """
    return {
        "oidc_sub": auth.oidc_sub,
        "name": auth.name,
        "email": auth.email,
        "scopes": auth.scopes,
        "disabled": False
    }


@router.put("/{user_id}/checkpoint-assignment")
async def update_checkpoint_assignment(
    user_id: int,
    assignment: CheckpointAssignmentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[DetailedUser, Depends(get_admin)],
) -> RallyStaffAssignmentWithCheckpoint:
    """
    Update a user's checkpoint assignment.
    This creates/updates Rally-specific staff assignments.
    """
    try:
        updated_assignment = await crud.rally_staff_assignment.create_or_update(
            db=db, user_id=user_id, checkpoint_id=assignment.checkpoint_id
        )
        
        if updated_assignment:
            # Return with checkpoint details
            assignment_data = {
                "id": updated_assignment.id,
                "user_id": updated_assignment.user_id,
                "checkpoint_id": updated_assignment.checkpoint_id,
                "checkpoint_name": updated_assignment.checkpoint.name if updated_assignment.checkpoint else None,
                "checkpoint_description": updated_assignment.checkpoint.description if updated_assignment.checkpoint else None,
            }
            return RallyStaffAssignmentWithCheckpoint(**assignment_data)
        else:
            # Assignment was removed
            return RallyStaffAssignmentWithCheckpoint(
                id=0, user_id=user_id, checkpoint_id=None, 
                checkpoint_name=None, checkpoint_description=None
            )
    except SQLAlchemyError as e:
        raise RallyValidationError(f"Failed to update checkpoint assignment: {str(e)}")


@router.get("/guide-assignments")
async def get_guide_assignments(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[DetailedUser, Depends(get_admin)],
) -> List[RallyGuideAssignmentWithCheckpoint]:
    """
    Get all rally-guide users and their checkpoint assignments.

    Mirrors the staff-assignment flow: members of the Authentik guide group
    are fetched live and mirrored locally, so an account shows up as soon as
    it is added to the group, with no prior login required.
    """
    group_members = await authentik_client.list_group_members(settings.OIDC_GUIDE_GROUP)
    for member in group_members:
        await crud.user.get_or_create_mirror(
            db,
            name=member.name,
            email=member.email,
            scope="rally-guide",
        )

    stmt = select(User).where(User.scopes.contains(['rally-guide']))
    rally_guide_users = (await db.scalars(stmt)).all()

    existing_assignments = await crud.rally_guide_assignment.get_multi_with_checkpoint(db)
    assignment_map = {assignment.user_id: assignment for assignment in existing_assignments}

    result = []
    for user in rally_guide_users:
        user_id = user.id
        assignment = assignment_map.get(user_id)

        if assignment:
            assignment_data = {
                "id": assignment.id,
                "user_id": user_id,
                "user_name": user.name,
                "user_email": user.email,
                "checkpoint_id": assignment.checkpoint_id,
                "checkpoint_name": assignment.checkpoint.name if assignment.checkpoint else None,
                "checkpoint_description": assignment.checkpoint.description if assignment.checkpoint else None,
            }
        else:
            assignment_data = {
                "id": 0,
                "user_id": user_id,
                "user_name": user.name,
                "user_email": user.email,
                "checkpoint_id": None,
                "checkpoint_name": None,
                "checkpoint_description": None,
            }

        result.append(RallyGuideAssignmentWithCheckpoint(**assignment_data))

    return result


@router.put("/{user_id}/guide-checkpoint-assignment")
async def update_guide_checkpoint_assignment(
    user_id: int,
    assignment: CheckpointAssignmentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[DetailedUser, Depends(get_admin)],
) -> RallyGuideAssignmentWithCheckpoint:
    """Update a guide user's checkpoint assignment."""
    try:
        updated_assignment = await crud.rally_guide_assignment.create_or_update(
            db=db, user_id=user_id, checkpoint_id=assignment.checkpoint_id
        )

        if updated_assignment:
            assignment_data = {
                "id": updated_assignment.id,
                "user_id": updated_assignment.user_id,
                "checkpoint_id": updated_assignment.checkpoint_id,
                "checkpoint_name": updated_assignment.checkpoint.name if updated_assignment.checkpoint else None,
                "checkpoint_description": updated_assignment.checkpoint.description if updated_assignment.checkpoint else None,
            }
            return RallyGuideAssignmentWithCheckpoint(**assignment_data)
        else:
            return RallyGuideAssignmentWithCheckpoint(
                id=0, user_id=user_id, checkpoint_id=None,
                checkpoint_name=None, checkpoint_description=None
            )
    except SQLAlchemyError as e:
        raise RallyValidationError(f"Failed to update guide checkpoint assignment: {str(e)}")
