"""Unit tests for the event subsystem (channels, schemas, publisher)."""

import json

import fakeredis.aioredis
import pytest

from app.core import redis as redis_module
from app.events import (
    EVENT_TYPE_TO_CHANNEL,
    Channels,
    EventType,
    TeamScoreUpdatedEvent,
    TeamScoreUpdatedPayload,
    publish_event,
)
from app.events.publisher import _channel_for


def test_every_event_type_has_a_channel() -> None:
    """A missing mapping would silently drop events at runtime."""
    for event_type in EventType:
        assert event_type in EVENT_TYPE_TO_CHANNEL


def test_event_envelope_defaults() -> None:
    event = TeamScoreUpdatedEvent(payload=TeamScoreUpdatedPayload(team_id=1, total_score=5))
    assert event.event_id
    assert event.source == "api-rally"
    # use_enum_values stores the raw string.
    assert event.event_type == EventType.TEAM_SCORE_UPDATED.value


def test_channel_for_resolves_from_raw_value() -> None:
    event = TeamScoreUpdatedEvent(payload=TeamScoreUpdatedPayload(team_id=1, total_score=5))
    assert _channel_for(event) == Channels.TEAM_SCORE_UPDATED


def test_channel_for_raises_when_event_type_unmapped(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every real EventType is mapped (see test_every_event_type_has_a_channel
    above); this drives the defensive `channel is None` branch directly by
    temporarily emptying the mapping, simulating a hypothetical future
    EventType added without updating EVENT_TYPE_TO_CHANNEL."""
    from app.events import publisher as publisher_module

    monkeypatch.setattr(publisher_module, "EVENT_TYPE_TO_CHANNEL", {})

    event = TeamScoreUpdatedEvent(payload=TeamScoreUpdatedPayload(team_id=1, total_score=5))

    from app.events.exceptions import EventPublishError

    with pytest.raises(EventPublishError):
        _channel_for(event)


async def test_publish_noop_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.events.publisher.settings.EVENTS_ENABLED", False)
    called = False

    def _fail() -> None:
        nonlocal called
        called = True
        raise AssertionError("Redis must not be touched when events are disabled")

    monkeypatch.setattr(redis_module, "get_async_redis_client", _fail)
    await publish_event(TeamScoreUpdatedEvent(payload=TeamScoreUpdatedPayload(team_id=1, total_score=5)))
    assert called is False


async def test_publish_sends_to_channel_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.events.publisher.settings.EVENTS_ENABLED", True)
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr("app.events.publisher.get_async_redis_client", lambda: fake)

    pubsub = fake.pubsub()
    await pubsub.subscribe(Channels.TEAM_SCORE_UPDATED)
    # Drain the subscribe confirmation message.
    await pubsub.get_message(timeout=1)

    await publish_event(
        TeamScoreUpdatedEvent(payload=TeamScoreUpdatedPayload(team_id=7, total_score=42))
    )

    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
    assert message is not None
    body = json.loads(message["data"])
    assert body["event_type"] == EventType.TEAM_SCORE_UPDATED.value
    assert body["payload"] == {"team_id": 7, "total_score": 42.0}
    await pubsub.aclose()


class _Broken:
    async def publish(self, *_: object) -> None:
        raise ConnectionError("down")

    async def aclose(self) -> None:
        """No-op close for the broken redis stub."""


async def test_publish_swallows_redis_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.events.publisher.settings.EVENTS_ENABLED", True)
    monkeypatch.setattr("app.events.publisher.settings.EVENTS_FAIL_SILENTLY", True)
    monkeypatch.setattr("app.events.publisher.get_async_redis_client", lambda: _Broken())
    # Must not raise — a publish failure cannot break an already-committed request.
    await publish_event(
        TeamScoreUpdatedEvent(payload=TeamScoreUpdatedPayload(team_id=1, total_score=1))
    )


async def test_publish_raises_when_not_fail_silently(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.events.publisher.settings.EVENTS_ENABLED", True)
    monkeypatch.setattr("app.events.publisher.settings.EVENTS_FAIL_SILENTLY", False)
    monkeypatch.setattr("app.events.publisher.get_async_redis_client", lambda: _Broken())

    from app.events.exceptions import EventPublishError

    call = publish_event(
        TeamScoreUpdatedEvent(payload=TeamScoreUpdatedPayload(team_id=1, total_score=1))
    )
    with pytest.raises(EventPublishError):
        await call
