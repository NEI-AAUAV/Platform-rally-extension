"""Unit tests for the reusable rate limiter (app.api.rate_limit)."""

from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException

from app.api import rate_limit as rl
from app.core.config import settings


def _request(peer: str = "1.2.3.4", headers: dict | None = None) -> Mock:
    req = Mock()
    req.client = Mock()
    req.client.host = peer
    req.headers = headers or {}
    return req


# --- client IP resolution ---------------------------------------------------

def test_resolve_client_ip_uses_peer_by_default():
    assert rl.resolve_client_ip(_request("9.9.9.9")) == "9.9.9.9"


def test_resolve_client_ip_ignores_xff_from_untrusted_peer():
    req = _request("9.9.9.9", {"x-forwarded-for": "6.6.6.6"})
    assert rl.resolve_client_ip(req) == "9.9.9.9"


def test_resolve_client_ip_trusts_xff_from_trusted_proxy():
    req = _request("10.0.0.1", {"x-forwarded-for": "6.6.6.6, 10.0.0.1"})
    with patch.object(settings, "TRUSTED_PROXIES", ["10.0.0.1"]):
        assert rl.resolve_client_ip(req) == "6.6.6.6"


# --- fixed-window enforcement ----------------------------------------------

def _fake_redis(count: int) -> Mock:
    client = Mock()
    client.incr = AsyncMock(return_value=count)
    client.expire = AsyncMock()
    client.aclose = AsyncMock()
    return client


@pytest.mark.asyncio
async def test_enforce_allows_under_limit():
    with patch.object(rl, "get_async_redis_client", return_value=_fake_redis(3)):
        await rl._enforce("k", limit=5, window_seconds=60)  # no raise


@pytest.mark.asyncio
async def test_enforce_blocks_over_limit():
    with patch.object(rl, "get_async_redis_client", return_value=_fake_redis(6)):
        with pytest.raises(HTTPException) as exc:
            await rl._enforce("k", limit=5, window_seconds=60)
        assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_enforce_fails_open_on_redis_error():
    client = Mock()
    client.incr = AsyncMock(side_effect=RuntimeError("redis down"))
    client.aclose = AsyncMock()
    with patch.object(rl, "get_async_redis_client", return_value=client):
        await rl._enforce("k", limit=1, window_seconds=60)  # swallowed, no raise


@pytest.mark.asyncio
async def test_login_limit_checks_ip_and_code_keys():
    """Both an IP-keyed and a code-keyed counter must be enforced."""
    seen: list[str] = []

    async def fake_enforce(key, limit, window):
        seen.append(key)

    with patch.object(rl, "_enforce", side_effect=fake_enforce):
        await rl.check_login_rate_limit(_request("1.1.1.1"), "ABCD-1234")

    assert any(k.startswith("rally:team-login:ip:") for k in seen)
    assert any(k.startswith("rally:team-login:code:") for k in seen)
    # Raw access code never used as a key.
    assert all("ABCD-1234" not in k for k in seen)
