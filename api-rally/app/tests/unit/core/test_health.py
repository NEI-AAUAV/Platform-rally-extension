"""Tests for the split liveness (/health) and readiness (/health/ready) probes.

/health must stay a simple always-200 liveness probe (it is the Docker
healthcheck target — returning 503 on a dependency outage would break container
orchestration). /health/ready aggregates DB + Redis + worker liveness and
returns 503 when any is unhealthy.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import main
from app.core.config import settings
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _fake_worker(name: str, alive: bool) -> SimpleNamespace:
    return SimpleNamespace(name=name, is_alive=alive, last_beat=123.0)


def test_health_is_liveness_always_200(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    # Even with every dependency down, liveness stays 200 so the container
    # healthcheck (and depends_on) is not tripped by a Redis/DB outage.
    monkeypatch.setattr(main, "check_redis_health", lambda: _async(False))
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


def test_ready_200_when_all_healthy(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setattr(main, "check_db_health", lambda: _async(True))
    monkeypatch.setattr(main, "check_redis_health", lambda: _async(True))
    monkeypatch.setattr(settings, "EVENTS_ENABLED", True)
    monkeypatch.setattr(main, "_workers", [_fake_worker("LeaderboardWorker", True)])

    resp = client.get("/health/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["db"] == "up"
    assert body["redis"] == "up"
    assert body["workers"][0]["alive"] is True


def test_ready_503_when_db_down(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setattr(main, "check_db_health", lambda: _async(False))
    monkeypatch.setattr(main, "check_redis_health", lambda: _async(True))
    monkeypatch.setattr(settings, "EVENTS_ENABLED", True)
    monkeypatch.setattr(main, "_workers", [_fake_worker("LeaderboardWorker", True)])

    resp = client.get("/health/ready")
    assert resp.status_code == 503
    assert resp.json()["db"] == "down"


def test_ready_503_when_worker_dead(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setattr(main, "check_db_health", lambda: _async(True))
    monkeypatch.setattr(main, "check_redis_health", lambda: _async(True))
    monkeypatch.setattr(settings, "EVENTS_ENABLED", True)
    monkeypatch.setattr(main, "_workers", [_fake_worker("LeaderboardWorker", False)])

    resp = client.get("/health/ready")
    assert resp.status_code == 503
    assert resp.json()["workers"][0]["alive"] is False


def test_ready_skips_redis_and_workers_when_events_disabled(
    monkeypatch: pytest.MonkeyPatch, client: TestClient
) -> None:
    monkeypatch.setattr(main, "check_db_health", lambda: _async(True))
    monkeypatch.setattr(settings, "EVENTS_ENABLED", False)

    resp = client.get("/health/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert "redis" not in body
    assert body["workers"] == []


async def _async(value: bool) -> bool:
    import asyncio
    await asyncio.sleep(0)
    return value
