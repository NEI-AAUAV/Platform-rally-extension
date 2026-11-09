"""Tests for app.core.metrics and the /metrics endpoint."""

import json
import os
import subprocess
import sys
from pathlib import Path

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


def test_request_duration_histogram_measures_past_ten_seconds(client: TestClient) -> None:
    """A top finite bucket of 10s pins every slower request's quantile at 10s."""
    client.get("/health")
    resp = client.get("/metrics")
    assert 'rally_http_request_duration_seconds_bucket{le="60.0"' in resp.text


_RECORD_IN_ONE_PROCESS = """
from app.core import metrics
metrics.record_request(method="GET", path_template="/x", status=200, duration_seconds=0.25)
metrics.record_request(method="GET", path_template="/x", status=503, duration_seconds=0.25)
metrics.set_worker_last_beat_age(worker="scoring", age_seconds=AGE)
"""

_READ_FROM_ANOTHER_PROCESS = """
import json
from app.core import metrics
print(json.dumps({
    "summary": metrics.collect_summary(),
    "exposition": metrics.render_latest().decode(),
}))
"""


def _run_in_new_process(code: str, env: dict[str, str]) -> str:
    done = subprocess.run(
        [sys.executable, "-c", code],
        env=env,
        cwd=Path(__file__).resolve().parents[4],
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert done.returncode == 0, done.stderr
    return done.stdout


def test_uvicorn_workers_report_one_combined_set_of_totals(tmp_path: Path) -> None:
    """Each uvicorn worker is a separate process. A scrape answered by one
    worker must report every worker's requests, or the series jumps between
    per-process totals and Prometheus reads each drop as a counter reset."""
    env = {**os.environ, "PROMETHEUS_MULTIPROC_DIR": str(tmp_path), "METRICS_ENABLED": "true"}

    _run_in_new_process(_RECORD_IN_ONE_PROCESS.replace("AGE", "1.0"), env)
    _run_in_new_process(_RECORD_IN_ONE_PROCESS.replace("AGE", "7.0"), env)
    read = json.loads(_run_in_new_process(_READ_FROM_ANOTHER_PROCESS, env).splitlines()[-1])

    assert read["summary"]["requests_total"] == 4
    assert read["summary"]["errors_5xx"] == 2
    assert read["summary"]["request_duration_seconds_count"] == 4
    assert read["summary"]["request_duration_seconds_sum"] == pytest.approx(1.0)

    exposition = read["exposition"]
    assert (
        'rally_http_requests_total{method="GET",path_template="/x",status="200"} 2.0' in exposition
    )
    # The stalest worker is the one worth alerting on, with no per-pid series.
    assert 'rally_worker_last_beat_age_seconds{worker="scoring"} 7.0' in exposition


def _counter_value(counter, **labels) -> float:  # type: ignore[no-untyped-def]
    return counter.labels(**labels)._value.get()
