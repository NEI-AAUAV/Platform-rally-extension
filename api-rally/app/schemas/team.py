from typing import Optional, List
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from .user import ListingUser


class TeamBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    total: int
    classification: int
    versus_group_id: Optional[int] = None


class ListingTeam(TeamBase):
    """
    The schema returned when listing multiple teams
    """

    num_members: int
    times: List[datetime] = []

    last_checkpoint_time: Optional[datetime]
    last_checkpoint_score: Optional[int] = None
    last_checkpoint_number: Optional[int] = None
    last_checkpoint_name: Optional[str] = None
    current_checkpoint_number: Optional[int] = None


class DetailedTeam(TeamBase):
    access_code: str
    times: List[datetime]

    score_per_checkpoint: List[int]

    members: List[ListingUser]

    # Activity-based completion counters (more reliable than len(times))
    last_checkpoint_number: Optional[int] = None
    current_checkpoint_number: Optional[int] = None
    total_checkpoints: Optional[int] = None


class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    times: Optional[List[datetime]] = None
    score_per_checkpoint: Optional[List[int]] = None
    question_scores: Optional[List[bool]] = None
    time_scores: Optional[List[int]] = None
    pukes: Optional[int] = None
    skips: Optional[int] = None

class AdminCheckPointSelect(BaseModel):
    # For admin's only
    checkpoint_id: Optional[int] = None


class TeamScoresUpdate(AdminCheckPointSelect):
    question_score: int
    time_score: int
    pukes: int
    skips: int