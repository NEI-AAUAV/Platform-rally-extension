"""Rally event subsystem: channels, typed events and the async publisher."""

from app.events.channels import Channels
from app.events.exceptions import EventPublishError
from app.events.publisher import EVENT_TYPE_TO_CHANNEL, publish_event
from app.events.schemas import (
    ActivityResultChangedPayload,
    ActivityResultCreatedEvent,
    ActivityResultDeletedEvent,
    ActivityResultUpdatedEvent,
    BaseEvent,
    EventType,
    RallyEndedEvent,
    RallyLifecyclePayload,
    RallyStartedEvent,
    TeamCheckpointAdvancedEvent,
    TeamCheckpointAdvancedPayload,
    TeamScoreUpdatedEvent,
    TeamScoreUpdatedPayload,
)

__all__ = [
    "Channels",
    "EventPublishError",
    "EVENT_TYPE_TO_CHANNEL",
    "publish_event",
    "BaseEvent",
    "EventType",
    "ActivityResultChangedPayload",
    "ActivityResultCreatedEvent",
    "ActivityResultUpdatedEvent",
    "ActivityResultDeletedEvent",
    "TeamScoreUpdatedEvent",
    "TeamScoreUpdatedPayload",
    "TeamCheckpointAdvancedEvent",
    "TeamCheckpointAdvancedPayload",
    "RallyStartedEvent",
    "RallyEndedEvent",
    "RallyLifecyclePayload",
]
