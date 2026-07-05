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

# Global sync connection pool (initialised lazily on first use). The async
# clients are intentionally pool-less — see get_async_redis_client.
_sync_pool: Optional[redis.ConnectionPool] = None


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


def get_redis_client() -> redis.Redis:
    """Return a synchronous Redis client (for the worker thread)."""
    return redis.Redis(connection_pool=_get_sync_pool())


def get_async_redis_client() -> aredis.Redis:
    """Return a standalone asyncio Redis client (routes/publisher/SSE/workers).

    Deliberately NOT backed by a shared module-level pool: the worker runs each
    event in its own short-lived loop (``asyncio.run`` per message), and a pool
    whose connections were bound to an earlier loop raises "got Future attached
    to a different loop" on reuse. A fresh client per call — always closed via
    ``aclose()`` by the caller — binds its connections to the current loop and
    sidesteps that entirely. Callers already create-and-close per use, so the
    pool gave no reuse benefit here.
    """
    return aredis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        password=settings.REDIS_PASSWORD,
        decode_responses=True,
        socket_connect_timeout=settings.REDIS_CONNECTION_TIMEOUT,
        socket_timeout=settings.REDIS_CONNECTION_TIMEOUT,
    )


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


def close_pools() -> None:
    """Disconnect the sync pool (called on application shutdown).

    Async clients are pool-less and closed by their callers, so there is no
    shared async pool to tear down here.
    """
    global _sync_pool
    if _sync_pool is not None:
        _sync_pool.disconnect()
        _sync_pool = None
    logger.info("Redis pools closed")
