from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app import crud
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_admin
from fastapi import Security
from app.schemas.user import DetailedUser
from app.schemas.rally_staff_assignment import RallyStaffAssignmentWithCheckpoint

router = APIRouter()


class CheckpointAssignmentUpdate(BaseModel):
    checkpoint_id: int | None = None


@router.get("/staff-assignments")
async def get_staff_assignments(
    *, db: Session = Depends(get_db), _: DetailedUser = Depends(get_admin)
) -> List[RallyStaffAssignmentWithCheckpoint]:
    """
    Get all users with rally-staff role from NEI platform and their checkpoint assignments.
    This shows all rally-staff users from the main NEI platform and their current checkpoint assignments.
    """
    # Get all users with rally-staff role from NEI User table
    from app.models.nei_user import NEIUser
    from sqlalchemy import select
    
    # Query users with rally-staff scope from NEI's user table
    from sqlalchemy import text
    stmt = select(NEIUser).where(text("scopes @> ARRAY['rally-staff']::text[]"))
    rally_staff_users = db.scalars(stmt).all()
    
    # Get existing assignments
    existing_assignments = crud.rally_staff_assignment.get_multi_with_checkpoint(db)
    assignment_map = {assignment.user_id: assignment for assignment in existing_assignments}
    
    # Build result list with all rally-staff users from NEI
    result = []
    for user in rally_staff_users:
        user_id = user.id
        assignment = assignment_map.get(user_id)
        
        if assignment:
            # User has an assignment
            assignment_data = {
                "id": assignment.id,
                "user_id": user_id,
                "user_name": f"{user.name} {user.surname}",
                "user_email": None,  # Email is in separate table
                "checkpoint_id": assignment.checkpoint_id,
                "checkpoint_name": assignment.checkpoint.name if assignment.checkpoint else None,
                "checkpoint_description": assignment.checkpoint.description if assignment.checkpoint else None,
            }
        else:
            # User has no assignment
            assignment_data = {
                "id": 0,  # Temporary ID for unassigned users
                "user_id": user_id,
                "user_name": f"{user.name} {user.surname}",
                "user_email": None,  # Email is in separate table
                "checkpoint_id": None,
                "checkpoint_name": None,
                "checkpoint_description": None,
            }
        
        result.append(RallyStaffAssignmentWithCheckpoint(**assignment_data))
    
    return result


@router.get("/me")
async def get_me(*, auth: AuthData = Security(api_nei_auth, scopes=[])) -> Dict[str, Any]:
    """
    Get current user information.
    Returns the authenticated user from the NEI platform.
    """
    return {
        "id": auth.sub,
        "name": f"{auth.name} {auth.surname}",
        "email": auth.email,
        "scopes": auth.scopes,
        "disabled": False
    }


@router.put("/{user_id}/checkpoint-assignment")
async def update_checkpoint_assignment(
    *,
    db: Session = Depends(get_db),
    user_id: int,
    assignment: CheckpointAssignmentUpdate,
    _: DetailedUser = Depends(get_admin)
) -> RallyStaffAssignmentWithCheckpoint:
    """
    Update a user's checkpoint assignment.
    This creates/updates Rally-specific staff assignments.
    """
    try:
        updated_assignment = crud.rally_staff_assignment.create_or_update(
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
