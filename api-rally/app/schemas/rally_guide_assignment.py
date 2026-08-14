from pydantic import BaseModel, ConfigDict


class RallyGuideAssignmentBase(BaseModel):
    user_id: int
    team_id: int | None = None


class RallyGuideAssignmentCreate(RallyGuideAssignmentBase): ...


class RallyGuideAssignmentUpdate(BaseModel):
    team_id: int | None = None


class RallyGuideAssignment(RallyGuideAssignmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class RallyGuideAssignmentWithTeam(RallyGuideAssignment):
    """Guide assignment with team details"""

    team_name: str | None = None
    user_name: str | None = None
    user_email: str | None = None
