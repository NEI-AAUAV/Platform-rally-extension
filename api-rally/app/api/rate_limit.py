"""Reusable fixed-window rate limiting backed by Redis.

Best-effort brute-force / abuse guard. Fails **open** when Redis is
unavailable (logged at WARNING): the limiter only slows abuse, it is never
the sole authority protecting an endpoint.

Client identity is resolved with trusted-proxy awareness: ``X-Forwarded-For``
is honoured only when the direct peer is a configured trusted proxy
(``settings.TRUSTED_PROXIES``); otherwise the direct peer address is used.
This prevents both spoofed client IPs and, behind a reverse proxy, collapsing
every client onto the proxy address.
"""

import hashlib
import logging
from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import HTTPException, Request, status

from app.core.config import Settings, SettingsDep
from app.core.redis import get_async_redis_client

logger = logging.getLogger(__name__)


def resolve_client_ip(request: Request, settings: Settings) -> str:
    """Resolve the caller's IP, trusting X-Forwarded-For only from a proxy."""
    peer = request.client.host if request.client else "unknown"
    if peer in settings.TRUSTED_PROXIES:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Left-most entry is the original client; the rest are proxies.
            return forwarded.split(",")[0].strip()
    return peer


async def _enforce(key: str, limit: int, window_seconds: int) -> None:
    """Increment a fixed-window counter and raise 429 when the limit is passed.

    Fails open on any Redis error — the guard is best-effort.
    """
    client = get_async_redis_client()
    try:
        attempts = await client.incr(key)
        if attempts == 1:
            await client.expire(key, window_seconds)
        if attempts > limit:
            ttl = await client.ttl(key)
            if ttl < 0:
                # Key orphaned without TTL (crash between INCR and EXPIRE):
                # re-arm so the block cannot last forever.
                await client.expire(key, window_seconds)
                ttl = window_seconds
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests, try again later",
                headers={"Retry-After": str(max(ttl, 1))},
            )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — rate limit is best-effort
        logger.warning("Rate limit unavailable for key %s: %s", key, exc)
    finally:
        await client.aclose()


def rate_limit(
    prefix: str, limit: int, window_seconds: int
) -> Callable[[Request, SettingsDep], Coroutine[Any, Any, None]]:
    """Build a FastAPI dependency enforcing ``limit`` per ``window_seconds``.

    Keyed by the resolved client IP under ``rally:ratelimit:{prefix}:{ip}``.
    Use for authenticated write/verify endpoints where the caller is a client,
    not a secret to be guessed.
    """

    async def dependency(request: Request, settings: SettingsDep) -> None:
        ip = resolve_client_ip(request, settings)
        await _enforce(f"rally:ratelimit:{prefix}:{ip}", limit, window_seconds)

    return dependency


async def check_login_rate_limit(request: Request, access_code: str, settings: Settings) -> None:
    """Brute-force guard for team login.

    Enforces two independent fixed-window counters so neither a single IP
    hammering many codes nor many IPs hammering one code slips through:

    * per resolved client IP (throttles one attacker's guess rate)
    * per submitted access code (throttles a distributed guess of one code)

    The access code is hashed before use as a key so raw secrets never land in
    Redis. Both use the login attempt/window settings. Fails open.
    """
    ip = resolve_client_ip(request, settings)
    code_hash = hashlib.sha256(access_code.encode("utf-8")).hexdigest()[:32]
    limit = settings.TEAM_LOGIN_RATE_LIMIT_ATTEMPTS
    window = settings.TEAM_LOGIN_RATE_LIMIT_WINDOW_SECONDS

    await _enforce(f"rally:team-login:ip:{ip}", limit, window)
    await _enforce(f"rally:team-login:code:{code_hash}", limit, window)
