"""Live scoreboard: a cached ranking snapshot and a Server-Sent Events stream.

Both endpoints are public (the scoreboard is a public-facing view) and only
operate when the realtime subsystem is enabled. The worker keeps the cached
ranking fresh and signals refreshes on a Redis channel; the SSE stream forwards
those signals so the SPA can refetch without polling.
"""

from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from redis.asyncio.client import PubSub

from app.api import deps
from app.core.config import SettingsDep
from app.core.redis import get_async_redis_client
from app.events.channels import Channels
from app.services import leaderboard_cache
from app.services.deps import get_scoring_service, get_team_service
from app.services.scoring_service import ScoringService
from app.services.team_service import TeamService

# Seconds between SSE heartbeats; keeps proxies from dropping an idle connection.
_HEARTBEAT_SECONDS = 15.0


def decode_value(value: str | bytes) -> str:
    return value.decode() if isinstance(value, bytes) else value


async def _next_message(pubsub: PubSub) -> dict[str, Any] | None:
    """Await the next pubsub message, or None once the heartbeat interval passes.

    The ``timeout`` argument is what makes this a blocking wait: without it
    ``get_message`` polls the socket and returns None immediately, so the
    surrounding ``while True`` becomes a hot loop that burns a full CPU core and
    floods the client with heartbeats for as long as one SSE client is attached.
    """
    try:
        message: dict[str, Any] | None = await pubsub.get_message(
            ignore_subscribe_messages=True,
            timeout=_HEARTBEAT_SECONDS,
        )
    except TimeoutError:
        return None
    return message


async def _pmessage_event_stream(request: Request) -> AsyncIterator[str]:
    client = get_async_redis_client()
    pubsub = client.pubsub()
    await pubsub.psubscribe(Channels.ALL_ACTIVITY_RESULT_EVENTS, Channels.ALL_TEAM_EVENTS)
    try:
        yield ": connected\n\n"
        while True:
            if await request.is_disconnected():
                break
            message = await _next_message(pubsub)
            if message and message.get("type") == "pmessage":
                channel = decode_value(message["channel"])
                data = decode_value(message["data"])
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
        self.router.add_api_route(
            "/scoreboard/recompute",
            self.recompute_classification,
            methods=["POST"],
            name="recompute_classification",
            dependencies=[Depends(deps.get_admin)],
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

    async def recompute_classification(
        self,
        scoring_service: Annotated[ScoringService, Depends(get_scoring_service)],
        team_service: Annotated[TeamService, Depends(get_team_service)],
    ) -> dict[str, Any]:
        """Admin escape hatch: re-price every result with the *current* scoring
        settings, recompute every team's total and rank, then drop the cached
        leaderboard so the next read is fresh.

        The re-price is the point. Every other path in the system rescores only
        the rows touched by the write that triggered it, so editing a scoring
        value in the admin (a penalty price, the extra-shot bonus, a
        DynamicRule) does not move results that were already scored. This
        endpoint is how that change is applied on purpose, rather than
        silently mid-event.

        It also remains the recovery path for a recompute that was missed
        outright — a crash mid-write, a stalled worker, a manual DB edit.
        """
        repriced = await scoring_service.reprice_all_results()
        # Same session, so the re-priced final_score values are what the
        # classification pass aggregates; its commit makes both durable.
        await team_service.update_classification()
        client = get_async_redis_client()
        try:
            await leaderboard_cache.invalidate_global_leaderboard(client)
        finally:
            await client.aclose()
        return {"status": "ok", "results_repriced": repriced}

    def stream_scoreboard(self, request: Request, settings: SettingsDep) -> StreamingResponse:
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
                    message = await _next_message(pubsub)
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

    def stream_rally_events(self, request: Request, settings: SettingsDep) -> StreamingResponse:
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
