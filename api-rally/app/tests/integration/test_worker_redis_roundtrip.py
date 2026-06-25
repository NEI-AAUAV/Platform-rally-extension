"""Real-Redis smoke for the event publisher → worker thread plumbing.

The fragile part of the realtime foundation is the seam between the async
publisher and the *synchronous* worker thread, which re-enters asyncio with
``asyncio.run`` for every message. Unit tests mock Redis, so they never cover
that seam. This test runs the real ``BaseWorker`` against a real Redis and
asserts a published event is actually delivered to ``handle_event``.

Skipped automatically when no Redis is reachable on the smoke port, so it stays
green in environments (CI without the service) that cannot run it. Start one
with: ``docker run -d -p 6399:6379 redis:7-alpine`` and set SMOKE_REDIS_PORT.
"""

import asyncio
import os
from typing import Any

import pytest
import redis as sync_redis

from app.core import redis as redis_mod
from app.core.config import settings
from app.events import (
    ActivityResultChangedPayload,
    ActivityResultCreatedEvent,
    Channels,
    publish_event,
)
from app.workers.base import BaseWorker

SMOKE_REDIS_HOST = os.getenv("SMOKE_REDIS_HOST", "localhost")
SMOKE_REDIS_PORT = int(os.getenv("SMOKE_REDIS_PORT", "6399"))


def _redis_available() -> bool:
    try:
        client = sync_redis.Redis(
            host=SMOKE_REDIS_HOST, port=SMOKE_REDIS_PORT, socket_connect_timeout=1
        )
        return bool(client.ping())
    except Exception:
        return False


pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not _redis_available(),
        reason=f"no Redis on {SMOKE_REDIS_HOST}:{SMOKE_REDIS_PORT}",
    ),
]


class _RecordingWorker(BaseWorker):
    """Worker that records every delivered event instead of recomputing."""

    patterns = [Channels.ALL_ACTIVITY_RESULT_EVENTS]

    def __init__(self) -> None:
        super().__init__()
        self.received: list[tuple[str, dict[str, Any]]] = []

    async def handle_event(self, channel: str, data: dict[str, Any]) -> None:
        self.received.append((channel, data))


async def test_published_event_reaches_worker_over_real_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Point both client families at the smoke Redis and force the subsystem on.
    monkeypatch.setattr(settings, "REDIS_HOST", SMOKE_REDIS_HOST)
    monkeypatch.setattr(settings, "REDIS_PORT", SMOKE_REDIS_PORT)
    monkeypatch.setattr(settings, "EVENTS_ENABLED", True)
    monkeypatch.setattr(settings, "EVENTS_FAIL_SILENTLY", False)
    # Pools are cached globals; drop them so they rebuild against the smoke port.
    monkeypatch.setattr(redis_mod, "_sync_pool", None)
    monkeypatch.setattr(redis_mod, "_async_pool", None)

    worker = _RecordingWorker()
    worker.start()
    try:
        # Let the daemon thread finish (p)subscribing before we publish.
        await asyncio.sleep(0.5)

        await publish_event(
            ActivityResultCreatedEvent(
                payload=ActivityResultChangedPayload(
                    result_id=1, team_id=2, activity_id=3
                )
            )
        )

        # Poll for delivery rather than sleeping a fixed (flaky) interval.
        for _ in range(50):
            if worker.received:
                break
            await asyncio.sleep(0.1)
    finally:
        worker.stop()
        await redis_mod.close_pools()

    assert worker.received, "worker never received the published event"
    channel, data = worker.received[0]
    assert channel == Channels.ACTIVITY_RESULT_CREATED
    assert data["event_type"] == "activity_result.created"
    assert data["payload"] == {"result_id": 1, "team_id": 2, "activity_id": 3}
