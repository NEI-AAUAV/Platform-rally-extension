"""Tests for the request-ID + timing middleware."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_generates_request_id_when_absent(client: TestClient) -> None:
    resp = client.get("/health")
    rid = resp.headers.get("X-Request-ID")
    assert rid
    # A generated ID is a valid UUID.
    uuid.UUID(rid)


def test_echoes_inbound_request_id(client: TestClient) -> None:
    resp = client.get("/health", headers={"X-Request-ID": "trace-abc-123"})
    assert resp.headers.get("X-Request-ID") == "trace-abc-123"


def test_sets_process_time_header(client: TestClient) -> None:
    resp = client.get("/health")
    pt = resp.headers.get("X-Process-Time-ms")
    assert pt is not None
    assert float(pt) >= 0
