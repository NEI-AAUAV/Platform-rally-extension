"""API tests for the live scoreboard endpoints."""

import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import leaderboard_cache

BASE = "/api/rally/v1"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_live_returns_503_when_disabled(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.api_v1.scoreboard.settings.EVENTS_ENABLED", False)
    resp = client.get(f"{BASE}/scoreboard/live")
    assert resp.status_code == 503


def test_stream_returns_503_when_disabled(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.api_v1.scoreboard.settings.EVENTS_ENABLED", False)
    resp = client.get(f"{BASE}/scoreboard/stream")
    assert resp.status_code == 503


def test_live_serves_cached_ranking(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.api_v1.scoreboard.settings.EVENTS_ENABLED", True)
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
