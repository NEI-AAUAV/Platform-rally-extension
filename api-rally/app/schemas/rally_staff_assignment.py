from typing import Optional
from pydantic import BaseModel, ConfigDict


class RallyStaffAssignmentBase(BaseModel):
    user_id: int
    checkpoint_id: Optional[int] = None


class RallyStaffAssignmentCreate(RallyStaffAssignmentBase):
    pass


class RallyStaffAssignmentUpdate(BaseModel):
    checkpoint_id: Optional[int] = None


class RallyStaffAssignment(RallyStaffAssignmentBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: int


class RallyStaffAssignmentWithCheckpoint(RallyStaffAssignment):
    """Staff assignment with checkpoint details"""
    checkpoint_name: Optional[str] = None
    checkpoint_description: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
