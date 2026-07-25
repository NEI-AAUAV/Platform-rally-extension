from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.user import ListingUser


class TeamBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    total: int
    classification: int
    versus_group_id: int | None = None
    photo_url: str = ""


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
    access_code: str
    times: list[datetime]

    score_per_checkpoint: list[int]

    members: list[ListingUser]

    # Activity-based completion counters (more reliable than len(times))
    last_checkpoint_number: int | None = None
    current_checkpoint_number: int | None = None
    total_checkpoints: int | None = None


class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: str | None = None
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
