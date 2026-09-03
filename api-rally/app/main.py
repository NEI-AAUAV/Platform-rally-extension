import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from loguru import logger
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api.api import api_v1_router
from app.core.config import settings
from app.core.exceptions import RallyError
from app.core.logging import bind_request_context, init_logging
from app.core.metrics import record_request, registry
from app.core.observability import init_sentry
from app.core.redis import close_pools
from app.db.init_db import init_db
from app.workers import (
    BadgesWorker,
    BaseWorker,
    LeaderboardWorker,
    ScoringWorker,
    clear_workers,
    get_workers,
    register_worker,
)


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
            register_worker(worker)
        logger.info("Realtime subsystem enabled: started {} worker(s)", len(get_workers()))

    try:
        yield
    finally:
        for worker in get_workers():
            worker.stop()
        clear_workers()
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
    content: dict[str, Any] = {"detail": exc.message}
    if exc.details is not None:
        # Machine-readable companion to the prose, so clients act on a code
        # and fields rather than on the wording of the sentence.
        content["details"] = exc.details
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Log validation errors for debugging.

    Logs only the field-level error list (which omits raw input values), never
    the raw request body — bodies can carry access codes / bearer tokens.
    """
    # Strip the offending input value (and ctx, which can echo it) so secrets
    # never reach the logs or the error response.
    safe_errors = [
        {k: v for k, v in err.items() if k not in ("input", "ctx")} for err in exc.errors()
    ]
    logger.error(f"Validation error on {request.method} {request.url.path}: {safe_errors}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": safe_errors}
    )


# CORSMiddleware works correctly at runtime, but mypy type stubs for Starlette 0.50 are outdated
#
# `CORS_ORIGINS`, not `BACKEND_CORS_ORIGINS`: the middleware compares the
# `Origin` header against this list by string equality, and the raw
# `AnyHttpUrl` values stringify with a trailing slash the header never carries
# — so passing them through matched nothing at all. See the property's
# docstring in app/core/config.py.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
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
    with bind_request_context(request_id=request_id):
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
        # Route template, not the raw path — raw paths carry team/activity
        # IDs and would blow up label cardinality. Falls back to the raw path
        # for unmatched routes (404s), which are low-cardinality by nature.
        route = request.scope.get("route")
        path_template = route.path if route is not None else request.url.path
        record_request(
            method=request.method,
            path_template=path_template,
            status=response.status_code,
            duration_seconds=elapsed_ms / 1000,
        )
    return response


def _append_vary(response: Response, field: str) -> None:
    """Add ``field`` to the response's ``Vary`` header without dropping what is
    already there.

    ``CORSMiddleware`` also writes ``Vary: Origin``, and it wraps this
    middleware, so neither side may overwrite the header — both have to append.
    Comparison is case-insensitive because header field names are.
    """
    existing = response.headers.get("Vary")
    if not existing:
        response.headers["Vary"] = field
        return
    fields = [part.strip() for part in existing.split(",") if part.strip()]
    if any(part.lower() == field.lower() for part in fields):
        return
    response.headers["Vary"] = ", ".join([*fields, field])


@app.middleware("http")
async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Attach baseline security response headers.

    HSTS is only sent in production (over HTTPS) — asserting it over plain HTTP
    in dev would pin browsers to https://localhost.

    API responses additionally get ``Vary: Authorization`` and
    ``Cache-Control: private, no-store``. Many endpoints return a different body
    for the same URL depending on the bearer token — ``GET /checkpoint/`` alone
    serves an admin, a per-team and a public slice — so any shared or
    identity-blind cache keyed on the URL alone can hand one caller another
    caller's representation. The PWA service worker is the concrete case (see
    ``web-rally/src/sw.ts``), which is why this is belt-and-braces: the worker
    refuses to cache authenticated requests at all, and these headers stop any
    other cache in the path from making the same mistake.
    """
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.url.path.startswith(settings.API_V1_STR):
        _append_vary(response, "Authorization")
        response.headers.setdefault("Cache-Control", "private, no-store")
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
    the whole stack. Dependency status lives in the readiness probe instead,
    under the versioned prefix (see ``app.api.api_v1.health``).
    """
    return {
        "status": "healthy",
        "service": "rally-api",
        "version": "1.0.0",
    }


@app.get("/metrics", tags=["health"], include_in_schema=False)
async def metrics() -> Response:
    """Prometheus scrape endpoint.

    Gated on ``settings.METRICS_ENABLED``; MUST additionally be blocked at
    the reverse proxy in production — this flag alone does not restrict
    access to the endpoint.
    """
    if not settings.METRICS_ENABLED:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "Not Found"})
    return Response(content=generate_latest(registry), media_type=CONTENT_TYPE_LATEST)


if __name__ == "__main__":
    # Use this for debugging purposes only
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8082, log_level="debug")
