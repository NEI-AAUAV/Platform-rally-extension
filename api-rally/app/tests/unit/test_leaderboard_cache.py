"""Unit tests for the Redis leaderboard cache."""

import fakeredis.aioredis
import pytest

from app.services import leaderboard_cache as cache


@pytest.fixture
def client() -> fakeredis.aioredis.FakeRedis:
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


async def test_read_returns_none_when_empty(client: fakeredis.aioredis.FakeRedis) -> None:
    assert await cache.read_global_leaderboard(client) is None


async def test_write_then_read_roundtrip(client: fakeredis.aioredis.FakeRedis) -> None:
    ranking = [
        {"rank": 1, "team_id": 2, "team_name": "B", "total_score": 30.0, "activities_completed": 3},
        {"rank": 2, "team_id": 1, "team_name": "A", "total_score": 10.0, "activities_completed": 1},
    ]
    await cache.write_global_leaderboard(client, ranking)
    assert await cache.read_global_leaderboard(client) == ranking


async def test_read_discards_corrupt_payload(client: fakeredis.aioredis.FakeRedis) -> None:
    await client.set(cache.GLOBAL_LEADERBOARD_KEY, "not-json{")
    assert await cache.read_global_leaderboard(client) is None


async def test_read_rejects_non_list(client: fakeredis.aioredis.FakeRedis) -> None:
    await client.set(cache.GLOBAL_LEADERBOARD_KEY, '{"team_id": 1}')
    assert await cache.read_global_leaderboard(client) is None
