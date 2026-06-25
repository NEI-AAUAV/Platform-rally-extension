"""Live scoreboard: a cached ranking snapshot and a Server-Sent Events stream.

Both endpoints are public (the scoreboard is a public-facing view) and only
operate when the realtime subsystem is enabled. The worker keeps the cached
ranking fresh and signals refreshes on a Redis channel; the SSE stream forwards
those signals so the SPA can refetch without polling.
"""

import asyncio
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.core.redis import get_async_redis_client
from app.events.channels import Channels
from app.services import leaderboard_cache
from app.services.scoring_service import ScoringService

router = APIRouter()

# Seconds between SSE heartbeats; keeps proxies from dropping an idle connection.
_HEARTBEAT_SECONDS = 15.0


@router.get("/scoreboard/live")
async def get_live_scoreboard(
    *, db: AsyncSession = Depends(get_db)
) -> list[dict[str, Any]]:
    """Return the cached global ranking, recomputing on a cache miss."""
    if not settings.EVENTS_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Realtime scoreboard is disabled",
        )

    client = get_async_redis_client()
    try:
        cached = await leaderboard_cache.read_global_leaderboard(client)
        if cached is not None:
            return cached
        # Cold cache: compute once, warm the cache, then serve.
        ranking = await ScoringService(db).get_team_ranking()
        await leaderboard_cache.write_global_leaderboard(client, ranking)
        return ranking
    finally:
        await client.aclose()


@router.get("/scoreboard/stream")
async def stream_scoreboard(request: Request) -> StreamingResponse:
    """Server-Sent Events stream that emits a 'refresh' on each leaderboard update."""
    if not settings.EVENTS_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Realtime scoreboard is disabled",
        )

    async def event_stream() -> AsyncIterator[str]:
        client = get_async_redis_client()
        pubsub = client.pubsub()
        await pubsub.subscribe(Channels.LEADERBOARD_REFRESHED)
        try:
            yield ": connected\n\n"
            while True:
                if await request.is_disconnected():
                    break
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=_HEARTBEAT_SECONDS
                )
                if message and message.get("type") == "message":
                    yield "event: refresh\ndata: 1\n\n"
                else:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            raise
        finally:
            await pubsub.aclose()
            await client.aclose()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
