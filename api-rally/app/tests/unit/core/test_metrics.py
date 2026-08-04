"""Tests for app.core.metrics and the /metrics endpoint."""

import pytest
from fastapi.testclient import TestClient
from prometheus_client.parser import text_string_to_metric_families

from app.core import metrics
from app.core.config import settings
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _metric_names(text: str) -> set[str]:
    return {family.name for family in text_string_to_metric_families(text)}


def test_metrics_endpoint_exposes_registered_series(client: TestClient) -> None:
    resp = client.get("/metrics")
    assert resp.status_code == 200
    # prometheus_client's parser strips the trailing "_total"/"_created" from
    # counter family names, so assert on the base name.
    names = _metric_names(resp.text)
    assert "rally_http_requests" in names
    assert "rally_http_request_duration_seconds" in names
    assert "rally_worker_last_beat_age_seconds" in names
    assert "rally_events_published" in names
    assert "rally_rate_limit_rejections" in names
    assert "rally_scoring_recompute_duration_seconds" in names


def test_metrics_endpoint_404_when_disabled(
    monkeypatch: pytest.MonkeyPatch, client: TestClient
) -> None:
    monkeypatch.setattr(settings, "METRICS_ENABLED", False)
    resp = client.get("/metrics")
    assert resp.status_code == 404


def test_a_request_is_recorded_with_route_template_not_raw_path(client: TestClient) -> None:
    """The label must be the route template (e.g. "/health") — a raw path
    carrying an ID (e.g. "/team/42") would blow up cardinality."""
    client.get("/health")
    resp = client.get("/metrics")
    assert 'path_template="/health"' in resp.text


def test_record_request_is_noop_when_metrics_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "METRICS_ENABLED", False)
    before = metrics.http_requests_total.collect()[0].samples
    metrics.record_request(method="GET", path_template="/x", status=200, duration_seconds=0.01)
    after = metrics.http_requests_total.collect()[0].samples
    assert before == after


def test_record_event_published_increments_counter(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "METRICS_ENABLED", True)
    before = _counter_value(metrics.events_published_total, event_type="x", outcome="success")
    metrics.record_event_published(event_type="x", outcome="success")
    after = _counter_value(metrics.events_published_total, event_type="x", outcome="success")
    assert after == before + 1


def test_record_rate_limit_rejection_increments_counter(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "METRICS_ENABLED", True)
    before = _counter_value(metrics.rate_limit_rejections_total, prefix="rally:ratelimit:x")
    metrics.record_rate_limit_rejection(prefix="rally:ratelimit:x")
    after = _counter_value(metrics.rate_limit_rejections_total, prefix="rally:ratelimit:x")
    assert after == before + 1


def test_set_worker_last_beat_age_sets_gauge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "METRICS_ENABLED", True)
    metrics.set_worker_last_beat_age(worker="TestWorker", age_seconds=5.0)
    value = metrics.worker_last_beat_age_seconds.labels(worker="TestWorker")._value.get()
    assert value == 5.0


def test_collect_summary_totals_match_the_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "METRICS_ENABLED", True)
    before = metrics.collect_summary()

    metrics.record_request(method="GET", path_template="/x", status=200, duration_seconds=0.25)
    metrics.record_request(method="GET", path_template="/x", status=503, duration_seconds=0.25)

    after = metrics.collect_summary()
    assert after["requests_total"] == before["requests_total"] + 2
    # Only the 503 counts as a server error; the 200 must not.
    assert after["errors_5xx"] == before["errors_5xx"] + 1
    assert after["request_duration_seconds_count"] == before["request_duration_seconds_count"] + 2
    assert after["request_duration_seconds_sum"] == pytest.approx(
        before["request_duration_seconds_sum"] + 0.5
    )


def test_collect_summary_counts_rate_limit_rejections(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "METRICS_ENABLED", True)
    before = metrics.collect_summary()["rate_limit_rejections"]
    metrics.record_rate_limit_rejection(prefix="rally:ratelimit:summary")
    assert metrics.collect_summary()["rate_limit_rejections"] == before + 1


def test_admin_metrics_endpoint_requires_auth(client: TestClient) -> None:
    """The raw /metrics scrape has no auth and is not routed publicly, so the
    browser-facing equivalent must not be readable anonymously."""
    resp = client.get(f"{settings.API_V1_STR}/admin/metrics")
    assert resp.status_code in (401, 403)


def _counter_value(counter, **labels) -> float:  # type: ignore[no-untyped-def]
    return counter.labels(**labels)._value.get()
