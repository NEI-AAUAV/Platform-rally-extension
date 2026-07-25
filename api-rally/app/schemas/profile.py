"""Schemas for the per-person profile / participation history."""

from datetime import datetime

from pydantic import BaseModel


class ParticipationEntry(BaseModel):
    """One event a person took part in, with their team and result."""

    event_id: int
    event_name: str
    event_type: str
    team_id: int | None = None
    team_name: str | None = None
    team_total: int | None = None
    team_classification: int | None = None
    is_captain: bool = False
    joined_at: datetime


class ClaimableMember(BaseModel):
    """A name-only placeholder member a person can claim as themselves."""

    id: int
    name: str
    is_captain: bool = False

    class Config:
        from_attributes = True


class ClaimableTeam(BaseModel):
    """A team (resolved by access code) and its claimable placeholder members."""

    team_id: int
    team_name: str
    members: list[ClaimableMember] = []


class ProfileResponse(BaseModel):
    """A person's rally profile: identity + participation history."""

    authentik_sub: str
    name: str | None = None
    email: str | None = None
    scopes: list[str] = []
    current_team_id: int | None = None
    participations: list[ParticipationEntry] = []
