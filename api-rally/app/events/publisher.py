"""Async event publisher over Redis Pub/Sub.

Events must be published *after* the database commit that produced them, so
subscribers never observe state that a later rollback would erase.

The publisher is a no-op when ``settings.EVENTS_ENABLED`` is False: callers can
publish unconditionally without guarding every call site.
"""

import logging

from app.core.config import settings
from app.core.metrics import record_event_published
from app.core.redis import get_async_redis_client
from app.events.channels import Channels
from app.events.exceptions import EventPublishError
from app.events.schemas import BaseEvent, EventType

logger = logging.getLogger(__name__)

# Map each event type to its Redis channel.
EVENT_TYPE_TO_CHANNEL: dict[EventType, str] = {
    EventType.ACTIVITY_RESULT_CREATED: Channels.ACTIVITY_RESULT_CREATED,
    EventType.ACTIVITY_RESULT_UPDATED: Channels.ACTIVITY_RESULT_UPDATED,
    EventType.ACTIVITY_RESULT_DELETED: Channels.ACTIVITY_RESULT_DELETED,
    EventType.TEAM_SCORE_UPDATED: Channels.TEAM_SCORE_UPDATED,
    EventType.TEAM_CHECKPOINT_ADVANCED: Channels.TEAM_CHECKPOINT_ADVANCED,
    EventType.RALLY_STARTED: Channels.RALLY_STARTED,
    EventType.RALLY_ENDED: Channels.RALLY_ENDED,
    EventType.BADGE_AWARDED: Channels.BADGE_AWARDED,
}


def _channel_for(event: BaseEvent) -> str:
    # use_enum_values=True stores event_type as the raw string value.
    event_type = EventType(event.event_type)
    channel = EVENT_TYPE_TO_CHANNEL.get(event_type)
    if channel is None:
        raise EventPublishError(f"No channel mapped for event type {event_type!r}")
    return channel


async def publish_event(event: BaseEvent) -> None:
    """Publish a single event to its channel.

    No-op when the realtime subsystem is disabled. On a Redis/connection error
    the behaviour follows ``settings.EVENTS_FAIL_SILENTLY``: when True (default)
    the error is logged and swallowed so a publish failure never breaks the
    request that already committed its data; when False it raises
    ``EventPublishError``.
    """
    if not settings.EVENTS_ENABLED:
        return

    channel = _channel_for(event)
    client = get_async_redis_client()
    try:
        await client.publish(channel, event.model_dump_json())
        logger.debug("Published %s to %s", event.event_type, channel)
        record_event_published(event_type=str(event.event_type), outcome="success")
    except Exception as exc:  # noqa: BLE001 — publish must not break the caller
        record_event_published(event_type=str(event.event_type), outcome="failure")
        msg = f"Failed to publish {event.event_type} to {channel}: {exc}"
        if settings.EVENTS_FAIL_SILENTLY:
            logger.error(msg)
        else:
            raise EventPublishError(msg) from exc
    finally:
        await client.aclose()
