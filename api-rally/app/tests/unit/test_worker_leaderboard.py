"""Unit tests for the leaderboard worker."""

from contextlib import asynccontextmanager
from typing import Any

import fakeredis.aioredis
import pytest

from app.events.channels import Channels
from app.services import leaderboard_cache
from app.workers.worker_leaderboard import LeaderboardWorker


@asynccontextmanager
async def _fake_session():
    yield object()  # ScoringService is stubbed, so the session is never used


class _FakeScoringService:
    def __init__(self, _session: Any) -> None:
        """Session is unused; ranking is stubbed below."""

    async def get_team_ranking(self) -> list[dict[str, Any]]:
        return [
            {"rank": 1, "team_id": 9, "team_name": "Z", "total_score": 99.0, "activities_completed": 5},
        ]


async def test_rebuild_writes_cache_and_signals(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr("app.workers.worker_leaderboard.worker_session", _fake_session)
    monkeypatch.setattr("app.workers.worker_leaderboard.ScoringService", _FakeScoringService)
    monkeypatch.setattr(
        "app.workers.worker_leaderboard.get_async_redis_client", lambda: fake
    )

    pubsub = fake.pubsub()
    await pubsub.subscribe(Channels.LEADERBOARD_REFRESHED)
    await pubsub.get_message(timeout=1)  # drain subscribe confirmation

    worker = LeaderboardWorker()
    await worker.handle_event(Channels.TEAM_SCORE_UPDATED, {"event_type": "team.score_updated"})

    cached = await leaderboard_cache.read_global_leaderboard(fake)
    assert cached is not None
    assert cached[0]["team_id"] == 9

    signal = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
    assert signal is not None
    assert signal["data"] == "1"
    await pubsub.aclose()


def test_worker_subscribes_to_relevant_patterns() -> None:
    worker = LeaderboardWorker()
    assert Channels.ALL_ACTIVITY_RESULT_EVENTS in worker.patterns
    assert Channels.ALL_TEAM_EVENTS in worker.patterns
