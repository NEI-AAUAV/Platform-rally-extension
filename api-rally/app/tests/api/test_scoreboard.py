"""API tests for the live scoreboard endpoints."""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.services import leaderboard_cache

BASE = "/api/rally/v1"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@contextmanager
def _override_settings(**overrides: Any) -> Iterator[None]:
    base = get_settings()
    patched = base.model_copy(update=overrides)
    app.dependency_overrides[get_settings] = lambda: patched
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_settings, None)


def test_live_returns_503_when_disabled(client: TestClient) -> None:
    with _override_settings(EVENTS_ENABLED=False):
        resp = client.get(f"{BASE}/scoreboard/live")
    assert resp.status_code == 503


def test_stream_returns_503_when_disabled(client: TestClient) -> None:
    with _override_settings(EVENTS_ENABLED=False):
        resp = client.get(f"{BASE}/scoreboard/stream")
    assert resp.status_code == 503


def test_live_serves_cached_ranking(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr("app.api.api_v1.scoreboard.get_async_redis_client", lambda: fake)

    ranking = [
        {"rank": 1, "team_id": 3, "team_name": "Cobras", "total_score": 50.0, "activities_completed": 4},
    ]

    import asyncio

    asyncio.run(leaderboard_cache.write_global_leaderboard(fake, ranking))

    resp = client.get(f"{BASE}/scoreboard/live")
    assert resp.status_code == 200
    assert resp.json() == ranking
