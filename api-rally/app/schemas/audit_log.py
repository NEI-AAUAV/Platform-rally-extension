"""Schemas for the general (non-evaluation) audit trail."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AuditLogEntry(BaseModel):
    """One audit-trail row: who did what, to what, and when."""

    id: int
    event_id: int | None = None
    actor_id: str | None = None
    actor_name: str | None = None
    actor_kind: str
    action: str
    target_type: str
    target_id: str | None = None
    changes: dict[str, Any] = Field(default_factory=dict)
    note: str | None = None
    request_id: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
