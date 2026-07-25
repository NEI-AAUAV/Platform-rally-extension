from pydantic import BaseModel, ConfigDict


class RallyStaffAssignmentBase(BaseModel):
    user_id: int
    checkpoint_id: int | None = None


class RallyStaffAssignmentCreate(RallyStaffAssignmentBase): ...


class RallyStaffAssignmentUpdate(BaseModel):
    checkpoint_id: int | None = None


class RallyStaffAssignment(RallyStaffAssignmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class RallyStaffAssignmentWithCheckpoint(RallyStaffAssignment):
    """Staff assignment with checkpoint details"""

    checkpoint_name: str | None = None
    checkpoint_description: str | None = None
    user_name: str | None = None
    user_email: str | None = None
