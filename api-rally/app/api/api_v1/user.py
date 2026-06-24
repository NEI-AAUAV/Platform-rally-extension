from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Security
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from sqlalchemy import select, text

from app import crud
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_admin
from app.schemas.user import DetailedUser
from app.schemas.rally_staff_assignment import RallyStaffAssignmentWithCheckpoint
from app.models.user import User

router = APIRouter()


class CheckpointAssignmentUpdate(BaseModel):
    checkpoint_id: int | None = None


@router.get("/staff-assignments")
async def get_staff_assignments(
    *, db: AsyncSession = Depends(get_db), _: DetailedUser = Depends(get_admin)
) -> List[RallyStaffAssignmentWithCheckpoint]:
    """
    Get all rally-staff users (mirrored locally from authentik on login) and
    their checkpoint assignments. A user appears here once they have logged in
    at least once and carry the rally-staff scope.
    """


    stmt = select(User).where(text("scopes @> ARRAY['rally-staff']::text[]"))
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
async def get_me(*, auth: AuthData = Security(api_nei_auth, scopes=[])) -> Dict[str, Any]:
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
    *,
    db: AsyncSession = Depends(get_db),
    user_id: int,
    assignment: CheckpointAssignmentUpdate,
    _: DetailedUser = Depends(get_admin)
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update checkpoint assignment: {str(e)}")
