"""Schemas for the per-person profile / participation history."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ParticipationEntry(BaseModel):
    """One event a person took part in, with their team and result."""

    event_id: int
    event_name: str
    event_type: str
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    team_total: Optional[int] = None
    team_classification: Optional[int] = None
    is_captain: bool = False
    joined_at: datetime


class ProfileResponse(BaseModel):
    """A person's rally profile: identity + participation history."""

    authentik_sub: str
    name: Optional[str] = None
    email: Optional[str] = None
    scopes: list[str] = []
    current_team_id: Optional[int] = None
    participations: list[ParticipationEntry] = []
