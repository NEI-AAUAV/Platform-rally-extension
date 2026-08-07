from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import ListingUser


class TeamBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    total: int
    classification: int
    versus_group_id: int | None = None
    photo_url: str = ""
    # Minutes after the event's start time that this team is allowed to set
    # off. 0 (the default) means it starts with everyone else.
    start_offset_minutes: int = 0


class ListingTeam(TeamBase):
    """
    The schema returned when listing multiple teams
    """

    num_members: int
    times: list[datetime] = []

    last_checkpoint_time: datetime | None
    last_checkpoint_score: int | None = None
    last_checkpoint_number: int | None = None
    last_checkpoint_name: str | None = None
    current_checkpoint_number: int | None = None


class DetailedTeam(TeamBase):
    times: list[datetime]

    score_per_checkpoint: list[int]

    members: list[ListingUser]

    # Activity-based completion counters (more reliable than len(times))
    last_checkpoint_number: int | None = None
    current_checkpoint_number: int | None = None
    total_checkpoints: int | None = None


class PrivilegedDetailedTeam(DetailedTeam):
    """DetailedTeam plus the team's access code.

    The access code is the sole authentication factor for team login, so it is
    only ever exposed to the team itself or to admin/staff-scoped callers.
    It is None whenever the caller is not entitled to see it.
    """

    access_code: str | None = None


class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: str | None = None
    start_offset_minutes: int | None = Field(default=None, ge=0, le=24 * 60)
    times: list[datetime] | None = None
    score_per_checkpoint: list[int] | None = None
    question_scores: list[bool] | None = None
    time_scores: list[int] | None = None
    pukes: int | None = None
    skips: int | None = None


class AdminCheckPointSelect(BaseModel):
    # For admin's only
    checkpoint_id: int | None = None


class TeamScoresUpdate(AdminCheckPointSelect):
    question_score: int
    time_score: int
    pukes: int
    skips: int
