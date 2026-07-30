"""Covers app.main's exception handlers, lifespan worker wiring, and
security-headers middleware branches not exercised by feature-specific API
tests."""

from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.core.exceptions import RallyError
from app.main import app, lifespan, settings


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

    main_module._workers.clear()
    async with lifespan(app):
        assert len(main_module._workers) == 3

    assert main_module._workers == []
    main_module.close_pools.assert_called_once()
