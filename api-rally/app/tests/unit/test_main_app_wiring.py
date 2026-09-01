"""Covers app.main's exception handlers, lifespan worker wiring, and
security-headers middleware branches not exercised by feature-specific API
tests."""

from unittest.mock import AsyncMock, MagicMock

from fastapi import Response
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.core.exceptions import RallyError
from app.main import app, lifespan, settings
from app.workers import clear_workers, get_workers


def test_rally_error_handler_logs_traceback_for_5xx(monkeypatch):
    """A RallyError with status_code >= 500 hits the `logger.exception`
    branch (base RallyError defaults to 500)."""

    monkeypatch.setattr(app.router, "routes", list(app.router.routes))

    @app.get("/__test-rally-500-error")
    async def _boom():
        raise RallyError("something broke")

    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/__test-rally-500-error")

    assert resp.status_code == 500
    assert resp.json() == {"detail": "something broke"}


def test_security_headers_include_hsts_in_production(monkeypatch):
    monkeypatch.setattr(settings, "PRODUCTION", True)
    client = TestClient(app)

    resp = client.get("/api/rally/v1/user/me")

    assert resp.headers.get("Strict-Transport-Security") == "max-age=31536000; includeSubDomains"


def test_security_headers_omit_hsts_outside_production(monkeypatch):
    monkeypatch.setattr(settings, "PRODUCTION", False)
    client = TestClient(app)

    resp = client.get("/api/rally/v1/user/me")

    assert "Strict-Transport-Security" not in resp.headers


def test_api_responses_vary_on_authorization():
    """Endpoints return a different body for the same URL depending on the
    bearer token (``GET /checkpoint/`` alone serves an admin, a per-team and a
    public slice), so a cache keyed on the URL alone can serve one caller
    another caller's data. ``Vary: Authorization`` is what tells such a cache
    the token is part of the key."""
    client = TestClient(app)

    resp = client.get("/api/rally/v1/user/me")

    vary = [part.strip().lower() for part in resp.headers.get("Vary", "").split(",")]
    assert "authorization" in vary


def test_api_responses_are_not_shared_cacheable():
    client = TestClient(app)

    resp = client.get("/api/rally/v1/user/me")

    assert resp.headers.get("Cache-Control") == "private, no-store"


def test_appending_vary_preserves_what_is_already_there():
    """``CORSMiddleware`` writes its own ``Vary: Origin`` and wraps this
    middleware, so neither side may overwrite the header — a lost entry is a
    wrong cache key, which is the very failure this header exists to prevent.
    Field names are case-insensitive, so a duplicate must not be appended
    merely because the casing differs."""
    from app.main import _append_vary

    response = Response()
    _append_vary(response, "Authorization")
    assert response.headers["Vary"] == "Authorization"

    response = Response(headers={"Vary": "Origin"})
    _append_vary(response, "Authorization")
    assert response.headers["Vary"] == "Origin, Authorization"

    response = Response(headers={"Vary": "origin, authorization"})
    _append_vary(response, "Authorization")
    assert response.headers["Vary"] == "origin, authorization"


def test_middleware_appends_to_a_vary_set_by_the_handler(monkeypatch):
    monkeypatch.setattr(app.router, "routes", list(app.router.routes))

    @app.get(f"{settings.API_V1_STR}/__test-handler-vary")
    async def _varies():
        return JSONResponse({}, headers={"Vary": "Accept-Encoding"})

    client = TestClient(app)
    resp = client.get(f"{settings.API_V1_STR}/__test-handler-vary")

    vary = [part.strip().lower() for part in resp.headers["Vary"].split(",")]
    assert vary == ["accept-encoding", "authorization"]


def test_cors_and_vary_headers_coexist_on_a_real_cross_origin_request():
    """End to end through both middlewares: CORS answers an allowed origin and
    its ``Vary: Origin`` survives alongside ``Vary: Authorization``. Either
    header overwriting the other would be a wrong cache key."""
    client = TestClient(app)
    allowed_origin = settings.CORS_ORIGINS[0]

    resp = client.get("/api/rally/v1/user/me", headers={"Origin": allowed_origin})

    assert resp.headers["Access-Control-Allow-Origin"] == allowed_origin
    vary = [part.strip().lower() for part in resp.headers["Vary"].split(",")]
    assert vary == ["origin", "authorization"]


def test_non_api_responses_are_left_cacheable():
    """The cache directives are scoped to the API. Static assets are public,
    immutable and content-hashed — marking them ``no-store`` would defeat the
    precache the PWA depends on."""
    client = TestClient(app)

    resp = client.get("/health")

    assert "Cache-Control" not in resp.headers
    assert "authorization" not in resp.headers.get("Vary", "").lower()


def test_handler_set_cache_control_survives_the_middleware(monkeypatch):
    """The SSE endpoints set ``Cache-Control: no-cache`` deliberately, so a
    proxy does not buffer the stream. The middleware fills in a default and
    must not stomp on a value the handler already chose."""
    monkeypatch.setattr(app.router, "routes", list(app.router.routes))

    @app.get(f"{settings.API_V1_STR}/__test-explicit-cache-control")
    async def _streamish():
        return JSONResponse({}, headers={"Cache-Control": "no-cache"})

    client = TestClient(app)
    resp = client.get(f"{settings.API_V1_STR}/__test-explicit-cache-control")

    assert resp.headers.get("Cache-Control") == "no-cache"
    # ...while the Vary key is still added, since it is appended, not defaulted.
    assert "authorization" in resp.headers.get("Vary", "").lower()


async def test_lifespan_starts_scoring_worker_when_recompute_off_path(monkeypatch):
    """When EVENTS_ENABLED and RECOMPUTE_OFF_PATH are both set, the lifespan
    also starts a ScoringWorker (covers the conditional worker_classes.append
    branch), and stops/clears all workers on shutdown."""
    import app.main as main_module

    monkeypatch.setattr(main_module.settings, "EVENTS_ENABLED", True)
    monkeypatch.setattr(main_module.settings, "RECOMPUTE_OFF_PATH", True)
    monkeypatch.setattr(main_module, "init_logging", MagicMock())
    monkeypatch.setattr(main_module, "init_sentry", MagicMock())
    monkeypatch.setattr(main_module, "init_db", AsyncMock())
    monkeypatch.setattr(main_module, "close_pools", MagicMock())

    fake_worker = MagicMock()
    fake_worker_cls = MagicMock(return_value=fake_worker)
    monkeypatch.setattr(main_module, "LeaderboardWorker", fake_worker_cls)
    monkeypatch.setattr(main_module, "BadgesWorker", fake_worker_cls)
    monkeypatch.setattr(main_module, "ScoringWorker", fake_worker_cls)

    # Running workers live in app.workers.registry, not app.main.
    clear_workers()
    async with lifespan(app):
        assert len(get_workers()) == 3

    assert get_workers() == ()
    main_module.close_pools.assert_called_once()
