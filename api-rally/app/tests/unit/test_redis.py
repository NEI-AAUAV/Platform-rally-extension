"""Unit tests for the Redis connection helpers (realtime foundation).

These exercise the health check and pool lifecycle against an in-memory fake
Redis, so they need no running Redis server.
"""

import fakeredis.aioredis
import pytest

from app.core import redis as redis_module
from app.core.config import settings


def test_events_disabled_by_default() -> None:
    """The realtime subsystem must default to off (zero behaviour change)."""
    assert settings.EVENTS_ENABLED is False


def test_redis_defaults() -> None:
    assert settings.REDIS_HOST
    assert isinstance(settings.REDIS_PORT, int)
    assert isinstance(settings.REDIS_CONNECTION_TIMEOUT, int)


async def test_check_redis_health_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(redis_module, "get_async_redis_client", lambda: fake)

    assert await redis_module.check_redis_health() is True


async def test_check_redis_health_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    import redis as sync_redis

    class _Broken:
        async def ping(self) -> bool:
            raise sync_redis.RedisError("boom")

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr(redis_module, "get_async_redis_client", lambda: _Broken())

    assert await redis_module.check_redis_health() is False


async def test_get_async_redis_dependency_yields_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(redis_module, "get_async_redis_client", lambda: fake)

    gen = redis_module.get_async_redis()
    client = await gen.__anext__()
    try:
        await client.set("k", "v")
        assert await client.get("k") == "v"
    finally:
        await gen.aclose()
