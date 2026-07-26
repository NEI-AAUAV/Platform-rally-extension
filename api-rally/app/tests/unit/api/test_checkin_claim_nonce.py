"""Unit tests for `CheckinService.claim_nonce`, the check-in endpoint's
best-effort Redis replay guard (kept separate from the API-level tests, which
mock this out entirely).
"""

import fakeredis.aioredis
import pytest

from app.core.config import get_settings
from app.services import checkin_service as checkin_service_module
from app.services.checkin_service import CheckinService


@pytest.fixture
def settings():
    return get_settings()


@pytest.fixture
def service():
    return CheckinService(db=None)


async def test_claim_nonce_first_claim_is_fresh(
    monkeypatch: pytest.MonkeyPatch, settings, service
) -> None:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(checkin_service_module, "get_async_redis_client", lambda: fake)

    result = await service.claim_nonce("nonce-1", team_id=7, settings=settings)

    assert result is True


async def test_claim_nonce_second_claim_is_rejected(
    monkeypatch: pytest.MonkeyPatch, settings, service
) -> None:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(checkin_service_module, "get_async_redis_client", lambda: fake)

    first = await service.claim_nonce("nonce-2", team_id=7, settings=settings)
    second = await service.claim_nonce("nonce-2", team_id=7, settings=settings)

    assert first is True
    assert second is False


async def test_claim_nonce_different_teams_are_independent(
    monkeypatch: pytest.MonkeyPatch, settings, service
) -> None:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(checkin_service_module, "get_async_redis_client", lambda: fake)

    team_a = await service.claim_nonce("nonce-3", team_id=1, settings=settings)
    team_b = await service.claim_nonce("nonce-3", team_id=2, settings=settings)

    assert team_a is True
    assert team_b is True


async def test_claim_nonce_fails_open_when_redis_unavailable(
    monkeypatch: pytest.MonkeyPatch, settings, service
) -> None:
    """Redis errors must not block legit check-ins — sequential ordering is
    the authoritative guard, so the replay guard fails open (returns True)."""

    class _BrokenClient:
        async def set(self, *args, **kwargs):
            raise ConnectionError("redis down")

        async def aclose(self):
            # Mock close operation; no actual connection resources need to be cleaned up.
            pass

    monkeypatch.setattr(checkin_service_module, "get_async_redis_client", lambda: _BrokenClient())

    result = await service.claim_nonce("nonce-4", team_id=1, settings=settings)

    assert result is True
