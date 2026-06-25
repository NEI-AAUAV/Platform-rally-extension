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
    meta: dict[str, Any] = {}
    awarded_at: datetime
