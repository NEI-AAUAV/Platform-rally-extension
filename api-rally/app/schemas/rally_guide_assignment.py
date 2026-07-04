from typing import Optional
from pydantic import BaseModel, ConfigDict


class RallyGuideAssignmentBase(BaseModel):
    user_id: int
    checkpoint_id: Optional[int] = None


class RallyGuideAssignmentCreate(RallyGuideAssignmentBase):
    ...


class RallyGuideAssignmentUpdate(BaseModel):
    checkpoint_id: Optional[int] = None


class RallyGuideAssignment(RallyGuideAssignmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class RallyGuideAssignmentWithCheckpoint(RallyGuideAssignment):
    """Guide assignment with checkpoint details"""
    checkpoint_name: Optional[str] = None
    checkpoint_description: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
