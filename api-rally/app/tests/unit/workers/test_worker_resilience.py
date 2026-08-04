"""Unit tests for BaseWorker resilience: retry-with-backoff + liveness heartbeat.

A worker's pub/sub loop must survive a transient Redis outage (reconnect with
backoff) instead of dying permanently, and must expose whether it is currently
alive so the readiness probe can report a silently-stale leaderboard.
"""

import threading
import time
from typing import Any

import pytest
import redis

from app.workers import base
from app.workers.base import BaseWorker


class _NoopWorker(BaseWorker):
    """Minimal concrete worker; handle_event is never exercised here."""

    channels = ["test.chan"]

    async def handle_event(
        self, channel: str, data: dict[str, Any]
    ) -> None:  # pragma: no cover - unused
        return None


class _FlakyPubSub:
    """Fake pub/sub that raises RedisError on the first N subscribe calls."""

    def __init__(self, fail_times: int, stop_event: threading.Event) -> None:
        self._fail_times = fail_times
        self._subscribe_calls = 0
        self._stop_event = stop_event

    def subscribe(self, *_channels: str) -> None:
        self._subscribe_calls += 1
        if self._subscribe_calls <= self._fail_times:
            raise redis.RedisError("boom")

    def psubscribe(self, *_patterns: str) -> None:
        return None

    def get_message(self, timeout: float = 1.0) -> None:
        # Once subscribed successfully, idle until told to stop, then let the
        # loop observe the stop event.
        self._stop_event.wait(timeout=0.01)

    def close(self) -> None:
        return None


def _install_fake_client(monkeypatch: pytest.MonkeyPatch, pubsub: _FlakyPubSub) -> None:
    class _FakeClient:
        def pubsub(self) -> _FlakyPubSub:
            return pubsub

    monkeypatch.setattr(base, "get_redis_client", lambda: _FakeClient())


def test_reconnects_after_redis_error_instead_of_exiting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Make backoff effectively instant so the test is fast.
    monkeypatch.setattr(base, "RETRY_BACKOFF_BASE_SECONDS", 0.01)
    monkeypatch.setattr(base, "RETRY_BACKOFF_MAX_SECONDS", 0.02)

    worker = _NoopWorker()
    pubsub = _FlakyPubSub(fail_times=2, stop_event=worker._stop_event)
    _install_fake_client(monkeypatch, pubsub)

    t = threading.Thread(target=worker._run_loop, daemon=True)
    t.start()

    # Wait until the loop has retried past the failures and is alive.
    deadline = time.monotonic() + 3.0
    while time.monotonic() < deadline and not worker.is_alive:
        time.sleep(0.01)

    assert worker.is_alive, "worker should reconnect and become alive after RedisError"
    assert pubsub._subscribe_calls >= 3, "should retry subscribe past the failures"

    worker._stop_event.set()
    t.join(timeout=2.0)
    assert not t.is_alive(), "stop event must break the loop cleanly"


def test_is_alive_false_before_start_and_when_beat_is_stale(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    worker = _NoopWorker()
    # Never beaten yet.
    assert worker.is_alive is False

    # A stale heartbeat (older than the liveness window) reads as not-alive.
    worker._last_beat = time.monotonic() - (base.LIVENESS_WINDOW_SECONDS + 5)
    assert worker.is_alive is False

    # A fresh heartbeat reads as alive.
    worker._last_beat = time.monotonic()
    assert worker.is_alive is True


def test_stop_event_interrupts_backoff_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    # A long backoff must be cut short by stop() — not block shutdown.
    monkeypatch.setattr(base, "RETRY_BACKOFF_BASE_SECONDS", 30.0)
    monkeypatch.setattr(base, "RETRY_BACKOFF_MAX_SECONDS", 30.0)

    worker = _NoopWorker()
    pubsub = _FlakyPubSub(fail_times=999, stop_event=worker._stop_event)
    _install_fake_client(monkeypatch, pubsub)

    t = threading.Thread(target=worker._run_loop, daemon=True)
    t.start()
    time.sleep(0.05)  # let it enter the first backoff sleep

    started = time.monotonic()
    worker._stop_event.set()
    t.join(timeout=2.0)

    assert not t.is_alive(), "backoff sleep must be interruptible by stop event"
    assert time.monotonic() - started < 2.0
