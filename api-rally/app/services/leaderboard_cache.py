"""Redis-backed cache for the global team leaderboard.

The worker recomputes the ranking from Postgres and stores the rendered list
here; the scoreboard endpoint and the SSE stream read it back. Storing the full
rendered ranking (not just scores) keeps reads a single GET and matches the
shape the API already returns.

All functions take an async Redis client so they stay trivially testable and
free of global state.
"""

import json
import logging
from typing import Any

import redis.asyncio as aredis

logger = logging.getLogger(__name__)

GLOBAL_LEADERBOARD_KEY = "rally:leaderboard:global"


async def write_global_leaderboard(client: aredis.Redis, ranking: list[dict[str, Any]]) -> None:
    """Store the rendered global ranking as a JSON blob."""
    await client.set(GLOBAL_LEADERBOARD_KEY, json.dumps(ranking))


async def read_global_leaderboard(
    client: aredis.Redis,
) -> list[dict[str, Any]] | None:
    """Return the cached global ranking, or None when nothing is cached."""
    raw = await client.get(GLOBAL_LEADERBOARD_KEY)
    if raw is None:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("Discarding corrupt cached leaderboard: %s", exc)
        return None
    if not isinstance(data, list):
        return None
    return data
