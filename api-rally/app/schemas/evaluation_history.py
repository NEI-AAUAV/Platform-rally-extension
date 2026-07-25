"""Schemas for the evaluation audit trail."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class EvaluationHistoryEntry(BaseModel):
    """One audit-trail row: who changed what (or contested), and when."""

    id: int
    result_id: int
    action: str
    editor_id: str | None = None
    editor_name: str | None = None
    changes: dict[str, Any] = Field(default_factory=dict)
    note: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ContestRequest(BaseModel):
    """A team's dispute of a result. The reason is required and bounded."""

    reason: str = Field(min_length=1, max_length=1000)
