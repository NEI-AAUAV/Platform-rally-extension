"""Prometheus metrics.

All helpers are no-ops when ``settings.METRICS_ENABLED`` is false, so call
sites (middleware, workers, publisher, rate limiter) can call them
unconditionally rather than guarding every call. The registry is exposed via
``GET /metrics`` in ``app.main`` — that route must be blocked at the reverse
proxy in production; the flag alone does not restrict access.

Production runs several uvicorn workers. With ``PROMETHEUS_MULTIPROC_DIR`` set,
each worker writes its values to a file there and every read combines them, so
a scrape answered by any one worker reports all of them. Without it each worker
would expose only its own totals, and Prometheus would read every switch to a
lower total as a counter reset. The directory must exist before this module is
imported and be emptied when the service starts (see ``Dockerfile.prod``).
"""

import os

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest
from prometheus_client.multiprocess import MultiProcessCollector

from app.core.config import settings

registry = CollectorRegistry()

# Label for requests that matched no route; see the middleware in ``app.main``.
UNMATCHED_PATH_LABEL = "__unmatched__"

# The client's default buckets stop at 10s, which pins the quantile of anything
# slower at exactly 10s.
HTTP_DURATION_BUCKETS = (
    0.005,
    0.01,
    0.025,
    0.05,
    0.075,
    0.1,
    0.25,
    0.5,
    0.75,
    1.0,
    2.5,
    5.0,
    7.5,
    10.0,
    15.0,
    30.0,
    60.0,
)

# Route template (not the raw path) is used as a label — raw paths carry
# team/activity IDs and would blow up cardinality.
http_requests_total = Counter(
    "rally_http_requests_total",
    "Total HTTP requests handled",
    ["method", "path_template", "status"],
    registry=registry,
)
http_request_duration_seconds = Histogram(
    "rally_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path_template"],
    buckets=HTTP_DURATION_BUCKETS,
    registry=registry,
)
worker_last_beat_age_seconds = Gauge(
    "rally_worker_last_beat_age_seconds",
    "Seconds since the worker's last heartbeat",
    ["worker"],
    registry=registry,
    # Every uvicorn worker runs its own copy, and the stalest one is the signal.
    multiprocess_mode="max",
)
events_published_total = Counter(
    "rally_events_published_total",
    "Events published to Redis pub/sub",
    ["event_type", "outcome"],
    registry=registry,
)
rate_limit_rejections_total = Counter(
    "rally_rate_limit_rejections_total",
    "Requests rejected by the rate limiter",
    ["prefix"],
    registry=registry,
)
scoring_recompute_duration_seconds = Histogram(
    "rally_scoring_recompute_duration_seconds",
    "Duration of an activity-wide score recompute",
    registry=registry,
)


def record_request(
    *, method: str, path_template: str, status: int, duration_seconds: float
) -> None:
    if not settings.METRICS_ENABLED:
        return
    http_requests_total.labels(method=method, path_template=path_template, status=str(status)).inc()
    http_request_duration_seconds.labels(method=method, path_template=path_template).observe(
        duration_seconds
    )


def set_worker_last_beat_age(*, worker: str, age_seconds: float) -> None:
    if not settings.METRICS_ENABLED:
        return
    worker_last_beat_age_seconds.labels(worker=worker).set(age_seconds)


def record_event_published(*, event_type: str, outcome: str) -> None:
    if not settings.METRICS_ENABLED:
        return
    events_published_total.labels(event_type=event_type, outcome=outcome).inc()


def record_rate_limit_rejection(*, prefix: str) -> None:
    if not settings.METRICS_ENABLED:
        return
    rate_limit_rejections_total.labels(prefix=prefix).inc()


def observe_scoring_recompute(duration_seconds: float) -> None:
    if not settings.METRICS_ENABLED:
        return
    scoring_recompute_duration_seconds.observe(duration_seconds)


def _readable_registry() -> CollectorRegistry:
    """The registry to read from: every worker's values when multiprocess."""
    if not os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
        return registry
    combined = CollectorRegistry()
    MultiProcessCollector(combined)  # type: ignore[no-untyped-call]
    return combined


def render_latest() -> bytes:
    """The Prometheus text exposition served by ``GET /metrics``."""
    return generate_latest(_readable_registry())


def collect_summary() -> dict[str, float]:
    """Aggregate the registry into the handful of totals the admin panel shows.

    Reads the collectors directly rather than re-parsing the text exposition
    format, so the admin metrics endpoint stays independent of ``/metrics``
    (which is not reachable through the reverse proxy — see the module
    docstring).

    Note the sample names: ``prometheus_client`` strips the ``_total`` suffix
    from a Counter's metric name and re-adds it on the sample, so the samples
    are matched by name here rather than by the parent metric.
    """
    totals = {
        "requests_total": 0.0,
        "errors_5xx": 0.0,
        "rate_limit_rejections": 0.0,
        "request_duration_seconds_sum": 0.0,
        "request_duration_seconds_count": 0.0,
    }

    for metric in _readable_registry().collect():
        for sample in metric.samples:
            if sample.name == "rally_http_requests_total":
                totals["requests_total"] += sample.value
                if sample.labels.get("status", "").startswith("5"):
                    totals["errors_5xx"] += sample.value
            elif sample.name == "rally_rate_limit_rejections_total":
                totals["rate_limit_rejections"] += sample.value
            elif sample.name == "rally_http_request_duration_seconds_sum":
                totals["request_duration_seconds_sum"] += sample.value
            elif sample.name == "rally_http_request_duration_seconds_count":
                totals["request_duration_seconds_count"] += sample.value

    return totals
