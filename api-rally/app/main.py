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
from app.workers import LeaderboardWorker

# Background workers, started in the lifespan when EVENTS_ENABLED is set.
_workers: list[LeaderboardWorker] = []


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Application startup/shutdown.

    Startup: logging, schema bootstrap and (when the realtime subsystem is
    enabled) the background workers. Shutdown: stop workers and close Redis.
    """
    init_logging()
    await init_db()

    if settings.EVENTS_ENABLED:
        worker = LeaderboardWorker()
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
    """Log validation errors for debugging"""
    logger.error(f"Validation error on {request.method} {request.url.path}: {exc.errors()}")
    body = await request.body()
    body_str = body.decode('utf-8') if body else 'empty'
    logger.error(f"Request body: {body_str}")
    return ORJSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()}
    )
# CORSMiddleware works correctly at runtime, but mypy type stubs for Starlette 0.50 are outdated
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    # Only report on Redis when the realtime subsystem is enabled, so the
    # check stays a no-op (and never fails) in the default configuration.
    if settings.EVENTS_ENABLED:
        health["redis"] = "up" if await check_redis_health() else "down"
    return health


if __name__ == "__main__":
    # Use this for debugging purposes only
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8082, log_level="debug")
