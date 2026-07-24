import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request, status
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger

from app.db.init_db import init_db
from app.db.session import check_db_health
from app.api.api import api_v1_router
from app.core.logging import init_logging
from app.core.config import settings
from app.core.exceptions import RallyError
from app.core.observability import init_sentry
from app.core.redis import check_redis_health, close_pools
from app.workers import BadgesWorker, BaseWorker, LeaderboardWorker, ScoringWorker

# Background workers, started in the lifespan when EVENTS_ENABLED is set.
_workers: list[BaseWorker] = []


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Application startup/shutdown.

    Startup: logging, schema bootstrap and (when the realtime subsystem is
    enabled) the background workers. Shutdown: stop workers and close Redis.
    """
    init_logging()
    init_sentry()  # no-op unless SENTRY_DSN is configured
    await init_db()

    if settings.EVENTS_ENABLED:
        worker_classes: list[type[BaseWorker]] = [LeaderboardWorker, BadgesWorker]
        # The scoring worker only earns its keep when recompute is deferred off
        # the request path; otherwise routes already recompute inline and it
        # would just duplicate the work.
        if settings.RECOMPUTE_OFF_PATH:
            worker_classes.append(ScoringWorker)
        for worker_cls in worker_classes:
            worker = worker_cls()
            worker.start(background=True)
            _workers.append(worker)
        logger.info("Realtime subsystem enabled: started {} worker(s)", len(_workers))

    try:
        yield
    finally:
        for worker in _workers:
            worker.stop()
        _workers.clear()
        if settings.EVENTS_ENABLED:
            close_pools()


def _generate_unique_id(route: APIRoute) -> str:
    """Use the route function name as the operationId.

    Each router tag has unique function names (verified at review time), so
    this collapses noisy path-derived IDs (getTeamByIdApiRallyV1TeamIdGet)
    into clean ones (getTeamById) for the generated TS client.
    """
    return route.name


app = FastAPI(
    title="Rally Tascas API",
    lifespan=lifespan,
    generate_unique_id_function=_generate_unique_id,
)


@app.exception_handler(RallyError)
async def rally_error_handler(request: Request, exc: RallyError) -> JSONResponse:
    """Map domain errors to HTTP responses; log 5xx with a traceback."""
    where = f"{request.method} {request.url.path}"
    if exc.status_code >= 500:
        logger.exception(f"Rally error on {where}: {exc.message}")
    else:
        logger.warning(f"Rally error on {where}: {exc.message}")
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Log validation errors for debugging.

    Logs only the field-level error list (which omits raw input values), never
    the raw request body — bodies can carry access codes / bearer tokens.
    """
    # Strip the offending input value (and ctx, which can echo it) so secrets
    # never reach the logs or the error response.
    safe_errors = [
        {k: v for k, v in err.items() if k not in ("input", "ctx")}
        for err in exc.errors()
    ]
    logger.error(f"Validation error on {request.method} {request.url.path}: {safe_errors}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": safe_errors}
    )
# CORSMiddleware works correctly at runtime, but mypy type stubs for Starlette 0.50 are outdated
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registered last so it wraps every other middleware: the request ID and timing
# cover the whole chain, including security_headers below.
@app.middleware("http")
async def request_id_and_timing(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Attach a request ID and per-request timing; log one line per request.

    Reuses an inbound ``X-Request-ID`` (set by an upstream proxy) so a trace is
    correlated end to end, otherwise mints a UUID. Records wall time around the
    handler and exposes it as ``X-Process-Time-ms``.
    """
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time-ms"] = f"{elapsed_ms:.1f}"
    logger.info(
        "{method} {path} {status} {dur:.1f}ms rid={rid}",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        dur=elapsed_ms,
        rid=request_id,
    )
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Attach baseline security response headers.

    HSTS is only sent in production (over HTTPS) — asserting it over plain HTTP
    in dev would pin browsers to https://localhost.
    """
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if settings.PRODUCTION:
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
    return response


app.mount(settings.STATIC_STR, StaticFiles(directory="static"), name="static")
app.include_router(api_v1_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Liveness probe: 200 whenever the process can serve requests.

    This is the Docker healthcheck target (and gates ``depends_on``), so it must
    NOT fail on a dependency outage — a down Redis/DB would otherwise tear down
    the whole stack. Dependency status lives in ``/health/ready`` instead.
    """
    return {
        "status": "healthy",
        "service": "rally-api",
        "version": "1.0.0",
    }


@app.get("/health/ready", tags=["health"])
async def readiness_check() -> JSONResponse:
    """Readiness probe: aggregates DB, Redis and worker liveness.

    Returns 503 when any checked dependency is unhealthy so a silently-stale
    leaderboard (dead worker) or a database/Redis outage surfaces to ops. Not
    wired to the container healthcheck — see ``health_check``.
    """
    ready = True
    body: dict[str, object] = {}

    db_up = await check_db_health()
    body["db"] = "up" if db_up else "down"
    ready = ready and db_up

    workers: list[dict[str, object]] = []
    if settings.EVENTS_ENABLED:
        redis_up = await check_redis_health()
        body["redis"] = "up" if redis_up else "down"
        ready = ready and redis_up

        for worker in _workers:
            alive = worker.is_alive
            workers.append(
                {"name": worker.name, "alive": alive, "last_beat": worker.last_beat}
            )
            ready = ready and alive
    body["workers"] = workers

    body["status"] = "ready" if ready else "not_ready"
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=body,
    )


if __name__ == "__main__":
    # Use this for debugging purposes only
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8082, log_level="debug")
