from datetime import datetime

from pydantic import BaseModel


class TeamPaceEntry(BaseModel):
    id: int
    name: str
    rank: int
    elapsed_seconds: float | None
    elapsed_display: str | None
    started_at: datetime | None
    last_progress_at: datetime | None
    resolved_count: int
    total_checkpoints: int
    is_finished: bool


class PaceRanking(BaseModel):
    event_id: int
    entries: list[TeamPaceEntry]
