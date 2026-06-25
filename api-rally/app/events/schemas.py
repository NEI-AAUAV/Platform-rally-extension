"""Pydantic event models for the rally event subsystem.

Every event shares a base envelope (id, type, timestamp, source, version) and
carries a typed, domain-specific payload. Events are published to Redis after
the database commit that produced them.
"""

from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """All event types emitted by api-rally."""

    ACTIVITY_RESULT_CREATED = "activity_result.created"
    ACTIVITY_RESULT_UPDATED = "activity_result.updated"
    ACTIVITY_RESULT_DELETED = "activity_result.deleted"
    TEAM_SCORE_UPDATED = "team.score_updated"
    TEAM_CHECKPOINT_ADVANCED = "team.checkpoint_advanced"
    RALLY_STARTED = "rally.started"
    RALLY_ENDED = "rally.ended"
    BADGE_AWARDED = "badge.awarded"


class BaseEvent(BaseModel):
    """Base envelope for all events."""

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: EventType
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: str = "api-rally"
    version: str = "1.0"

    model_config = {"use_enum_values": True}


# --- Payloads -------------------------------------------------------------


class ActivityResultChangedPayload(BaseModel):
    """Payload for the activity_result.* events."""

    result_id: int
    team_id: int
    activity_id: int


class TeamScoreUpdatedPayload(BaseModel):
    """Payload for team.score_updated events."""

    team_id: int
    total_score: float


class TeamCheckpointAdvancedPayload(BaseModel):
    """Payload for team.checkpoint_advanced events."""

    team_id: int
    checkpoint_number: int


class RallyLifecyclePayload(BaseModel):
    """Payload for rally.started / rally.ended events."""

    rally_id: int


class BadgeAwardedPayload(BaseModel):
    """Payload for badge.awarded events."""

    team_id: int
    badge_type: str
    activity_id: int | None = None
    checkpoint_id: int | None = None


# --- Events ---------------------------------------------------------------


class ActivityResultCreatedEvent(BaseEvent):
    event_type: EventType = EventType.ACTIVITY_RESULT_CREATED
    payload: ActivityResultChangedPayload


class ActivityResultUpdatedEvent(BaseEvent):
    event_type: EventType = EventType.ACTIVITY_RESULT_UPDATED
    payload: ActivityResultChangedPayload


class ActivityResultDeletedEvent(BaseEvent):
    event_type: EventType = EventType.ACTIVITY_RESULT_DELETED
    payload: ActivityResultChangedPayload


class TeamScoreUpdatedEvent(BaseEvent):
    event_type: EventType = EventType.TEAM_SCORE_UPDATED
    payload: TeamScoreUpdatedPayload


class TeamCheckpointAdvancedEvent(BaseEvent):
    event_type: EventType = EventType.TEAM_CHECKPOINT_ADVANCED
    payload: TeamCheckpointAdvancedPayload


class RallyStartedEvent(BaseEvent):
    event_type: EventType = EventType.RALLY_STARTED
    payload: RallyLifecyclePayload


class RallyEndedEvent(BaseEvent):
    event_type: EventType = EventType.RALLY_ENDED
    payload: RallyLifecyclePayload


class BadgeAwardedEvent(BaseEvent):
    event_type: EventType = EventType.BADGE_AWARDED
    payload: BadgeAwardedPayload
