"""API tests for the live scoreboard endpoints."""

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient

from app.api.api_v1 import scoreboard as scoreboard_module
from app.api.api_v1.scoreboard import decode_value
from app.core.config import get_settings
from app.main import app
from app.services import leaderboard_cache

BASE = "/api/rally/v1"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


class _FakePubsub:
    """Shared pubsub double. `messages` is served in order to `get_message`
    (one per call, `None` once exhausted); defaults to no messages, i.e. a
    heartbeat-ping-only stream."""

    def __init__(self, messages: list[dict[str, Any]] | None = None) -> None:
        self.closed = False
        self.calls = 0
        self.channels: list[str] = []
        self._messages = list(messages or [])

    async def subscribe(self, *_channels: str) -> None:
        await asyncio.sleep(0)
        self.channels = list(_channels)

    psubscribe = subscribe

    async def get_message(self, ignore_subscribe_messages: bool) -> dict[str, Any] | None:
        await asyncio.sleep(0)
        self.calls += 1
        if self._messages:
            return self._messages.pop(0)
        return None

    async def aclose(self) -> None:
        await asyncio.sleep(0)
        self.closed = True


class _FakeClient:
    def __init__(self, messages: list[dict[str, Any]] | None = None) -> None:
        self.closed = False
        self._messages = messages

    def pubsub(self) -> _FakePubsub:
        return _FakePubsub(self._messages)

    async def aclose(self) -> None:
        await asyncio.sleep(0)
        self.closed = True


class _FakeRequest:
    """Reports connected for `disconnect_after` checks, then disconnected."""

    def __init__(self, disconnect_after: int = 1) -> None:
        self._calls = 0
        self._disconnect_after = disconnect_after

    async def is_disconnected(self) -> bool:
        await asyncio.sleep(0)
        self._calls += 1
        return self._calls > self._disconnect_after


@contextmanager
def _override_settings(**overrides: Any) -> Iterator[None]:
    base = get_settings()
    patched = base.model_copy(update=overrides)
    app.dependency_overrides[get_settings] = lambda: patched
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_settings, None)


def test_live_computes_from_db_when_disabled(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """With the realtime subsystem off, /scoreboard/live serves a DB compute
    (no Redis), not a 503."""
    ranking = [
        {
            "rank": 1,
            "team_id": 7,
            "team_name": "Lynxes",
            "total_score": 42.0,
            "activities_completed": 3,
        },
    ]

    async def _fake_ranking(self: Any) -> list[dict[str, Any]]:
        await asyncio.sleep(0)
        return ranking

    monkeypatch.setattr("app.api.api_v1.scoreboard.ScoringService.get_team_ranking", _fake_ranking)

    with _override_settings(EVENTS_ENABLED=False):
        resp = client.get(f"{BASE}/scoreboard/live")
    assert resp.status_code == 200
    assert resp.json() == ranking


def test_stream_returns_503_when_disabled(client: TestClient) -> None:
    with _override_settings(EVENTS_ENABLED=False):
        resp = client.get(f"{BASE}/scoreboard/stream")
    assert resp.status_code == 503


def test_live_serves_cached_ranking(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr("app.api.api_v1.scoreboard.get_async_redis_client", lambda: fake)

    ranking = [
        {
            "rank": 1,
            "team_id": 3,
            "team_name": "Cobras",
            "total_score": 50.0,
            "activities_completed": 4,
        },
    ]

    asyncio.run(leaderboard_cache.write_global_leaderboard(fake, ranking))

    resp = client.get(f"{BASE}/scoreboard/live")
    assert resp.status_code == 200
    assert resp.json() == ranking


def test_live_computes_and_warms_cache_on_miss(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Cold cache: compute the ranking once, warm the cache, then serve it."""
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr("app.api.api_v1.scoreboard.get_async_redis_client", lambda: fake)

    ranking = [
        {
            "rank": 1,
            "team_id": 9,
            "team_name": "Foxes",
            "total_score": 10.0,
            "activities_completed": 1,
        },
    ]

    async def _fake_ranking(self: Any) -> list[dict[str, Any]]:
        await asyncio.sleep(0)
        return ranking

    monkeypatch.setattr("app.api.api_v1.scoreboard.ScoringService.get_team_ranking", _fake_ranking)

    resp = client.get(f"{BASE}/scoreboard/live")
    assert resp.status_code == 200
    assert resp.json() == ranking

    cached = asyncio.run(leaderboard_cache.read_global_leaderboard(fake))
    assert cached == ranking


def test_events_stream_returns_503_when_disabled(client: TestClient) -> None:
    with _override_settings(EVENTS_ENABLED=False):
        resp = client.get(f"{BASE}/events/stream")
    assert resp.status_code == 503


def test_stream_rally_events_returns_streaming_response_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When realtime events are enabled, `stream_rally_events` returns a
    StreamingResponse wrapping `_pmessage_event_stream` (covers the
    happy-path return, without depending on ASGI transport timing)."""

    class _FakeRequest:
        async def is_disconnected(self) -> bool:
            await asyncio.sleep(0)
            return True

    async def _run() -> None:
        settings = get_settings().model_copy(update={"EVENTS_ENABLED": True})
        response = await scoreboard_module.ScoreboardController().stream_rally_events(
            _FakeRequest(), settings
        )
        assert response.media_type == "text/event-stream"
        assert response.headers["Cache-Control"] == "no-cache"

    asyncio.run(_run())


def test_stream_scoreboard_emits_refresh_on_publish(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Directly drive the `event_stream` generator returned by
    `stream_scoreboard`, avoiding real ASGI/network timing."""
    monkeypatch.setattr(
        scoreboard_module,
        "get_async_redis_client",
        lambda: _FakeClient(messages=[{"type": "message"}]),
    )

    async def _run() -> list[str]:
        settings = get_settings().model_copy(update={"EVENTS_ENABLED": True})
        response = await scoreboard_module.ScoreboardController().stream_scoreboard(
            _FakeRequest(disconnect_after=2), settings
        )
        events = []
        async for event in response.body_iterator:
            events.append(event)
            if len(events) >= 2:
                break
        return events

    events = asyncio.run(_run())
    assert events[0] == ": connected\n\n"
    assert any("event: refresh" in e for e in events)


def test_stream_scoreboard_emits_ping_and_stops_on_disconnect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No pubsub message arrives -> heartbeat ping is emitted; once the
    client disconnects the generator exits (covers the ping and break
    branches that `test_stream_scoreboard_emits_refresh_on_publish` and the
    fake-message path never reach)."""
    monkeypatch.setattr(scoreboard_module, "get_async_redis_client", lambda: _FakeClient())

    async def _run() -> list[str]:
        settings = get_settings().model_copy(update={"EVENTS_ENABLED": True})
        # Stay connected for the first check (so a ping is emitted), then
        # report disconnected to end the generator.
        response = await scoreboard_module.ScoreboardController().stream_scoreboard(
            _FakeRequest(disconnect_after=1), settings
        )
        events = []
        async for event in response.body_iterator:
            events.append(event)
        return events

    events = asyncio.run(_run())
    assert events[0] == ": connected\n\n"
    assert ": ping\n\n" in events


def test_pmessage_event_stream_emits_ping_and_stops_on_disconnect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Same as above for `_pmessage_event_stream`'s ping/break branches."""
    monkeypatch.setattr(scoreboard_module, "get_async_redis_client", lambda: _FakeClient())

    async def _run() -> list[str]:
        events = []
        request = _FakeRequest(disconnect_after=1)
        async for event in scoreboard_module._pmessage_event_stream(request):
            events.append(event)
        return events

    events = asyncio.run(_run())
    assert events[0] == ": connected\n\n"
    assert ": ping\n\n" in events


def test_pmessage_event_stream_forwards_activity_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Directly exercise `_pmessage_event_stream` so the pmessage/decode
    branches are covered without depending on ASGI transport timing."""
    pmessage = {
        "type": "pmessage",
        "channel": b"activity_result:1",
        "data": b'{"foo": "bar"}',
    }
    monkeypatch.setattr(
        scoreboard_module,
        "get_async_redis_client",
        lambda: _FakeClient(messages=[pmessage]),
    )

    async def _run() -> list[str]:
        events = []
        request = _FakeRequest(disconnect_after=2)
        async for event in scoreboard_module._pmessage_event_stream(request):
            events.append(event)
            if len(events) >= 2:
                break
        return events

    events = asyncio.run(_run())
    assert events[0] == ": connected\n\n"
    assert any('event: activity_result:1\ndata: {"foo": "bar"}' in e for e in events)


def test_decode_handles_str_and_bytes() -> None:
    assert decode_value("already-str") == "already-str"
    assert decode_value(b"bytes-value") == "bytes-value"
