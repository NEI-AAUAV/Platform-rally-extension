"""Abstract base for Redis Pub/Sub worker threads.

A worker subscribes to channels/patterns on a daemon thread and dispatches each
message to an async ``handle_event``. Because the rally data layer is async but
the pub/sub loop is a blocking sync call, each message is handled in its own
short-lived event loop via ``asyncio.run``. Handlers open their own database
session (see ``app.workers.session``) so they never share an engine across
event loops.
"""

import asyncio
import json
import logging
import random
import signal
import threading
import time
from abc import ABC, abstractmethod
from typing import Any

import redis

from app.core.config import settings
from app.core.metrics import set_worker_last_beat_age
from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)

# Reconnect backoff after a Redis error: exponential from BASE up to MAX, with
# jitter to avoid a thundering herd of workers reconnecting in lockstep.
RETRY_BACKOFF_BASE_SECONDS = 1.0
RETRY_BACKOFF_MAX_SECONDS = 30.0

# A worker counts as "alive" only if its last heartbeat is within this window.
# The pub/sub loop beats at least once per second (get_message timeout=1.0), so
# this leaves generous slack before a healthy worker looks stale.
LIVENESS_WINDOW_SECONDS = 30.0


class BaseWorker(ABC):
    """Base class for Redis Pub/Sub workers."""

    channels: list[str] = []
    patterns: list[str] = []

    def __init__(self) -> None:
        self._running = False
        self._thread: threading.Thread | None = None
        self._pubsub: redis.client.PubSub | None = None
        self._stop_event = threading.Event()
        # monotonic timestamp of the last successful pub/sub heartbeat; 0.0
        # means "never beaten". Read by `is_alive` for the readiness probe.
        self._last_beat: float = 0.0

    @property
    def name(self) -> str:
        return self.__class__.__name__

    @property
    def last_beat(self) -> float:
        """Monotonic timestamp of the last heartbeat (0.0 if never)."""
        return self._last_beat

    @property
    def is_alive(self) -> bool:
        """True when the worker beat within the liveness window.

        A dead or wedged worker stops beating; readiness reads this so a
        silently-stale leaderboard surfaces instead of passing health checks.
        """
        # 0.0 is the "never beat" sentinel; treat any falsy value as not-yet-alive
        # (avoids a float equality check).
        if not self._last_beat:
            return False
        return (time.monotonic() - self._last_beat) < LIVENESS_WINDOW_SECONDS

    def _beat(self) -> None:
        self._last_beat = time.monotonic()
        set_worker_last_beat_age(worker=self.name, age_seconds=0.0)

    @abstractmethod
    async def handle_event(self, channel: str, data: dict[str, Any]) -> None:
        """Process a single received event."""

    def _dispatch(self, message: dict[str, Any]) -> None:
        if message["type"] not in ("message", "pmessage"):
            return
        channel = message.get("channel", message.get("pattern", "unknown"))
        raw = message.get("data")
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(data, dict):
                logger.warning("[%s] Non-dict payload on %s, skipping", self.name, channel)
                return
            asyncio.run(self.handle_event(channel, data))
        except json.JSONDecodeError:
            logger.exception("[%s] Bad JSON on %s", self.name, channel)
        except Exception:  # noqa: BLE001 — one bad event must not kill the worker
            logger.exception("[%s] Error handling %s", self.name, channel)

    def _run_loop(self) -> None:
        """Supervise the pub/sub session, reconnecting on Redis errors.

        A Redis outage must not kill the worker permanently: on ``RedisError``
        we log, back off (exponential + jitter, interruptible by stop), and
        resubscribe. The loop only exits when ``_stop_event`` is set.
        """
        logger.info("[%s] Worker loop starting", self.name)
        attempt = 0
        while not self._stop_event.is_set():
            try:
                self._consume()
                # Clean exit from _consume means the stop event was set.
                break
            except redis.RedisError:
                attempt += 1
                delay = min(
                    RETRY_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)),
                    RETRY_BACKOFF_MAX_SECONDS,
                )
                delay += random.uniform(0, delay * 0.1)  # jitter
                logger.exception(
                    "[%s] Redis error (attempt %d), reconnecting in %.1fs",
                    self.name,
                    attempt,
                    delay,
                )
                # Interruptible sleep: a stop during backoff exits immediately.
                if self._stop_event.wait(timeout=delay):
                    break
        logger.info("[%s] Worker loop ended", self.name)

    def _consume(self) -> None:
        """Subscribe and consume until stopped. Raises RedisError on failure."""
        # redis does not type pubsub() under strict mypy.
        pubsub = get_redis_client().pubsub()  # type: ignore[no-untyped-call]
        self._pubsub = pubsub
        try:
            if self.channels:
                pubsub.subscribe(*self.channels)
            if self.patterns:
                pubsub.psubscribe(*self.patterns)
            logger.info(
                "[%s] Subscribed channels=%s patterns=%s",
                self.name,
                self.channels,
                self.patterns,
            )
            self._beat()  # subscribed successfully — mark alive
            while not self._stop_event.is_set():
                message = pubsub.get_message(timeout=1.0)
                self._beat()
                if message:
                    self._dispatch(message)
        finally:
            pubsub.close()

    def start(self, background: bool = True) -> None:
        if self._running:
            logger.warning("[%s] Already running", self.name)
            return
        if not settings.EVENTS_ENABLED:
            logger.info("[%s] Events disabled, not starting", self.name)
            return
        self._running = True
        self._stop_event.clear()
        if background:
            self._thread = threading.Thread(target=self._run_loop, daemon=True)
            self._thread.start()
            logger.info("[%s] Started in background thread", self.name)
        else:
            signal.signal(signal.SIGINT, self._signal_handler)
            signal.signal(signal.SIGTERM, self._signal_handler)
            self._run_loop()

    def stop(self, timeout: float = 5.0) -> None:
        if not self._running:
            return
        logger.info("[%s] Stopping", self.name)
        self._stop_event.set()
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=timeout)
        self._running = False
        self._last_beat = 0.0  # a stopped worker is not alive
        logger.info("[%s] Stopped", self.name)

    def _signal_handler(self, signum: int, _frame: Any) -> None:
        logger.info("[%s] Signal %s, shutting down", self.name, signum)
        self.stop()
