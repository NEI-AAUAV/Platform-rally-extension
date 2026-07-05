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
import signal
import threading
from abc import ABC, abstractmethod
from typing import Any, Optional

import redis

from app.core.config import settings
from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)


class BaseWorker(ABC):
    """Base class for Redis Pub/Sub workers."""

    channels: list[str] = []
    patterns: list[str] = []

    def __init__(self) -> None:
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._pubsub: Optional[redis.client.PubSub] = None
        self._stop_event = threading.Event()

    @property
    def name(self) -> str:
        return self.__class__.__name__

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
            asyncio.run(self.handle_event(channel, data))
        except json.JSONDecodeError:
            logger.exception("[%s] Bad JSON on %s", self.name, channel)
        except Exception:  # noqa: BLE001 — one bad event must not kill the worker
            logger.exception("[%s] Error handling %s", self.name, channel)

    def _run_loop(self) -> None:
        logger.info("[%s] Worker loop starting", self.name)
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
                self.name, self.channels, self.patterns,
            )
            while not self._stop_event.is_set():
                message = pubsub.get_message(timeout=1.0)
                if message:
                    self._dispatch(message)
        except redis.RedisError:
            logger.exception("[%s] Redis error", self.name)
        finally:
            pubsub.close()
            logger.info("[%s] Worker loop ended", self.name)

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
        logger.info("[%s] Stopped", self.name)

    def _signal_handler(self, signum: int, _frame: Any) -> None:
        logger.info("[%s] Signal %s, shutting down", self.name, signum)
        self.stop()
