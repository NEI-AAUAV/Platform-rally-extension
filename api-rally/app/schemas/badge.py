"""Pydantic schemas for team badges."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class TeamBadgeRead(BaseModel):
    """A single badge a team holds."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    badge_type: str
    activity_id: int | None = None
    checkpoint_id: int | None = None
    meta: dict[str, Any] = {}
    awarded_at: datetime


class BadgeDefinitionLite(BaseModel):
    """Display fields of a badge definition, for the team showcase."""

    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    description: str | None = None
    color: str
    glyph: str | None = None
    icon_url: str | None = None


class EarnedBadge(BaseModel):
    """A badge a team has earned, keyed by definition code."""

    code: str
    awarded_at: datetime
    meta: dict[str, Any] = {}


class BadgeShowcaseResponse(BaseModel):
    """Everything the team badge board needs in one request.

    ``definitions`` is the full active catalogue (drives the locked+earned grid);
    ``earned`` is this team's awards, joined to the catalogue by ``code``.
    """

    definitions: list[BadgeDefinitionLite]
    earned: list[EarnedBadge]
