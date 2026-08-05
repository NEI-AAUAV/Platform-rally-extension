"""Readiness probe and admin metrics.

Both live under the versioned API prefix rather than at the application root
because only ``/api/rally/...`` is proxied through to this service in
production — root paths never leave the Docker network. The liveness probe
(``GET /health`` in ``app.main``) stays at the root on purpose: it is the
container healthcheck target and is only ever called from inside the network.
"""

import time
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import get_admin
from app.core.config import settings
from app.core.metrics import collect_summary, set_worker_last_beat_age
from app.core.redis import check_redis_health
from app.db.session import check_db_health
from app.schemas.health import MetricsSummary, Readiness, WorkerHealth
from app.schemas.user import DetailedUser
from app.workers import get_workers


class HealthController:
    """REST controller for readiness and admin metrics."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/health/ready",
            self.readiness_check,
            methods=["GET"],
            name="readiness_check",
            response_model=Readiness,
            # Drop `redis` entirely when the realtime subsystem is off, rather
            # than reporting a null state that reads as "down".
            response_model_exclude_none=True,
        )
        self.router.add_api_route(
            "/admin/metrics",
            self.admin_metrics,
            methods=["GET"],
            name="get_admin_metrics",
            response_model=MetricsSummary,
        )

    async def readiness_check(self, response: Response) -> Readiness:
        """Readiness probe: aggregates DB, Redis and worker liveness.

        Returns 503 when any checked dependency is unhealthy so a silently
        stale leaderboard (dead worker) or a database/Redis outage surfaces to
        ops. Not wired to the container healthcheck — see ``health_check`` in
        ``app.main``.
        """
        db_up = await check_db_health()
        ready = db_up
        redis_state: str | None = None
        workers: list[WorkerHealth] = []

        if settings.EVENTS_ENABLED:
            redis_up = await check_redis_health()
            redis_state = "up" if redis_up else "down"
            ready = ready and redis_up

            for worker in get_workers():
                alive = worker.is_alive
                workers.append(
                    WorkerHealth(name=worker.name, alive=alive, last_beat=worker.last_beat)
                )
                ready = ready and alive
                age = 0.0 if not worker.last_beat else time.monotonic() - worker.last_beat
                set_worker_last_beat_age(worker=worker.name, age_seconds=age)

        if not ready:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

        return Readiness(
            status="ready" if ready else "not_ready",
            db="up" if db_up else "down",
            redis=redis_state,
            workers=workers,
        )

    async def admin_metrics(
        self,
        *,
        _admin: Annotated[DetailedUser, Depends(get_admin)],
    ) -> MetricsSummary:
        """Prometheus counters aggregated for the admin panel — admin only.

        The raw ``/metrics`` scrape endpoint has no authentication and is not
        routed publicly; this is the authenticated way to read the same
        counters from a browser.
        """
        return MetricsSummary(**collect_summary())


router = HealthController().router
