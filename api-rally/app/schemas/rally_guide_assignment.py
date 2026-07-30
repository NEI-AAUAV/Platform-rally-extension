from pydantic import BaseModel, ConfigDict


class RallyGuideAssignmentBase(BaseModel):
    user_id: int
    checkpoint_id: int | None = None


class RallyGuideAssignmentCreate(RallyGuideAssignmentBase): ...


class RallyGuideAssignmentUpdate(BaseModel):
    checkpoint_id: int | None = None


class RallyGuideAssignment(RallyGuideAssignmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class RallyGuideAssignmentWithCheckpoint(RallyGuideAssignment):
    """Guide assignment with checkpoint details"""

    checkpoint_name: str | None = None
    checkpoint_description: str | None = None
    user_name: str | None = None
    user_email: str | None = None
