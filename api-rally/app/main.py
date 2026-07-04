from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from fastapi.exceptions import RequestValidationError
from loguru import logger

from app.db.init_db import init_db
from app.api.api import api_v1_router
from app.core.logging import init_logging
from app.core.config import settings
from app.core.exceptions import RallyError
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
            await close_pools()


app = FastAPI(
    title="Rally Tascas API",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)


@app.exception_handler(RallyError)
async def rally_error_handler(request: Request, exc: RallyError) -> ORJSONResponse:
    """Map domain errors to HTTP responses; log 5xx with a traceback."""
    where = f"{request.method} {request.url.path}"
    if exc.status_code >= 500:
        logger.exception(f"Rally error on {where}: {exc.message}")
    else:
        logger.warning(f"Rally error on {where}: {exc.message}")
    return ORJSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> ORJSONResponse:
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
    return ORJSONResponse(
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
    """Health check endpoint for monitoring and load balancers"""
    health = {
        "status": "healthy",
        "service": "rally-api",
        "version": "1.0.0",
    }
    # Report on Redis whenever the realtime subsystem is enabled (the default).
    # When explicitly disabled the check is skipped so it never fails.
    if settings.EVENTS_ENABLED:
        health["redis"] = "up" if await check_redis_health() else "down"
    return health


if __name__ == "__main__":
    # Use this for debugging purposes only
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8082, log_level="debug")
