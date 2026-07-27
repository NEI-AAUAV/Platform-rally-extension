"""Live scoreboard: a cached ranking snapshot and a Server-Sent Events stream.

Both endpoints are public (the scoreboard is a public-facing view) and only
operate when the realtime subsystem is enabled. The worker keeps the cached
ranking fresh and signals refreshes on a Redis channel; the SSE stream forwards
those signals so the SPA can refetch without polling.
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.core.config import SettingsDep
from app.core.redis import get_async_redis_client
from app.events.channels import Channels
from app.services import leaderboard_cache
from app.services.deps import get_scoring_service
from app.services.scoring_service import ScoringService

# Seconds between SSE heartbeats; keeps proxies from dropping an idle connection.
_HEARTBEAT_SECONDS = 15.0


def _decode(value: str | bytes) -> str:
    return value.decode() if isinstance(value, bytes) else value


async def _pmessage_event_stream(request: Request) -> AsyncIterator[str]:
    client = get_async_redis_client()
    pubsub = client.pubsub()
    await pubsub.psubscribe(Channels.ALL_ACTIVITY_RESULT_EVENTS, Channels.ALL_TEAM_EVENTS)
    try:
        yield ": connected\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                async with asyncio.timeout(_HEARTBEAT_SECONDS):
                    message = await pubsub.get_message(ignore_subscribe_messages=True)
            except TimeoutError:
                message = None
            if message and message.get("type") == "pmessage":
                channel = _decode(message["channel"])
                data = _decode(message["data"])
                yield f"event: {channel}\ndata: {data}\n\n"
            else:
                yield ": ping\n\n"
    finally:
        await pubsub.aclose()  # type: ignore[no-untyped-call]
        await client.aclose()


class ScoreboardController:
    """REST controller for the live scoreboard and its SSE streams."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/scoreboard/live",
            self.get_live_scoreboard,
            methods=["GET"],
            name="get_live_scoreboard",
        )
        self.router.add_api_route(
            "/scoreboard/stream",
            self.stream_scoreboard,
            methods=["GET"],
            name="stream_scoreboard",
        )
        self.router.add_api_route(
            "/events/stream",
            self.stream_rally_events,
            methods=["GET"],
            name="stream_rally_events",
        )

    async def get_live_scoreboard(
        self,
        settings: SettingsDep,
        service: Annotated[ScoringService, Depends(get_scoring_service)],
    ) -> list[dict[str, Any]]:
        """Return the cached global ranking, recomputing on a cache miss.

        When the realtime subsystem is disabled there is no cache to read and no
        worker keeping it warm, but the ranking is still a plain DB computation —
        serve it directly from Postgres instead of failing the public view.
        """
        if not settings.EVENTS_ENABLED:
            return await service.get_team_ranking()

        client = get_async_redis_client()
        try:
            cached = await leaderboard_cache.read_global_leaderboard(client)
            if cached is not None:
                return cached
            # Cold cache: compute once, warm the cache, then serve.
            ranking = await service.get_team_ranking()
            await leaderboard_cache.write_global_leaderboard(client, ranking)
            return ranking
        finally:
            await client.aclose()

    async def stream_scoreboard(self, request: Request, settings: SettingsDep) -> StreamingResponse:
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
                    try:
                        async with asyncio.timeout(_HEARTBEAT_SECONDS):
                            message = await pubsub.get_message(ignore_subscribe_messages=True)
                    except TimeoutError:
                        message = None
                    if message and message.get("type") == "message":
                        yield "event: refresh\ndata: 1\n\n"
                    else:
                        yield ": ping\n\n"
            finally:
                # redis does not type the async pubsub aclose under strict mypy.
                await pubsub.aclose()  # type: ignore[no-untyped-call]
                await client.aclose()

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    async def stream_rally_events(
        self, request: Request, settings: SettingsDep
    ) -> StreamingResponse:
        """Server-Sent Events stream that forwards raw activity_result/team events.

        Unlike /scoreboard/stream (which only signals "leaderboard changed"), this
        stream forwards each event's type and JSON payload so callers can react to
        the specific team/activity involved — e.g. staff-evaluation and
        team-progress pages invalidating only their own affected queries instead
        of refetching on every unrelated event.
        """
        if not settings.EVENTS_ENABLED:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Realtime events are disabled",
            )

        return StreamingResponse(
            _pmessage_event_stream(request),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )


router = ScoreboardController().router
