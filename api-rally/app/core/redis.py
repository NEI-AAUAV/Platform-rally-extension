"""Redis connection management for the rally realtime foundation.

Provides two client families that share the same connection settings:

- A *sync* client (``get_redis_client``) for the background worker thread,
  which runs a blocking pub/sub loop outside the asyncio event loop.
- An *async* client (``get_async_redis``) for request handlers, the event
  publisher and the SSE stream, so a single ``PUBLISH``/``GET`` never blocks
  the FastAPI event loop.

Everything is feature-gated by ``settings.EVENTS_ENABLED`` at the call sites;
this module only manages connections.
"""

import logging
from typing import AsyncGenerator, Optional

import redis
import redis.asyncio as aredis

from app.core.config import settings

logger = logging.getLogger(__name__)

# Global connection pools (initialised lazily on first use).
_sync_pool: Optional[redis.ConnectionPool] = None
_async_pool: Optional[aredis.ConnectionPool] = None


def _get_sync_pool() -> redis.ConnectionPool:
    """Get or create the shared synchronous connection pool."""
    global _sync_pool
    if _sync_pool is None:
        _sync_pool = redis.ConnectionPool(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            decode_responses=True,
            socket_connect_timeout=settings.REDIS_CONNECTION_TIMEOUT,
            socket_timeout=settings.REDIS_CONNECTION_TIMEOUT,
        )
        logger.info(
            "Redis sync pool created for %s:%s", settings.REDIS_HOST, settings.REDIS_PORT
        )
    return _sync_pool


def _get_async_pool() -> aredis.ConnectionPool:
    """Get or create the shared asynchronous connection pool."""
    global _async_pool
    if _async_pool is None:
        _async_pool = aredis.ConnectionPool(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            decode_responses=True,
            socket_connect_timeout=settings.REDIS_CONNECTION_TIMEOUT,
            socket_timeout=settings.REDIS_CONNECTION_TIMEOUT,
        )
        logger.info(
            "Redis async pool created for %s:%s", settings.REDIS_HOST, settings.REDIS_PORT
        )
    return _async_pool


def get_redis_client() -> redis.Redis:
    """Return a synchronous Redis client (for the worker thread)."""
    return redis.Redis(connection_pool=_get_sync_pool())


def get_async_redis_client() -> aredis.Redis:
    """Return an asyncio Redis client (for routes/publisher/SSE)."""
    return aredis.Redis(connection_pool=_get_async_pool())


async def get_async_redis() -> AsyncGenerator[aredis.Redis, None]:
    """FastAPI dependency yielding an asyncio Redis client."""
    client = get_async_redis_client()
    try:
        yield client
    finally:
        await client.aclose()


async def check_redis_health() -> bool:
    """Return True when Redis answers PING, False on any Redis error."""
    client = get_async_redis_client()
    try:
        return bool(await client.ping())
    except redis.RedisError as exc:
        logger.warning("Redis health check failed: %s", exc)
        return False
    finally:
        await client.aclose()


async def close_pools() -> None:
    """Disconnect both pools (called on application shutdown)."""
    global _sync_pool, _async_pool
    if _sync_pool is not None:
        _sync_pool.disconnect()
        _sync_pool = None
    if _async_pool is not None:
        await _async_pool.disconnect()
        _async_pool = None
    logger.info("Redis pools closed")
