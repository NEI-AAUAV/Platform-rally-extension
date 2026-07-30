"""Prometheus metrics.

All helpers are no-ops when ``settings.METRICS_ENABLED`` is false, so call
sites (middleware, workers, publisher, rate limiter) can call them
unconditionally rather than guarding every call. The registry is exposed via
``GET /metrics`` in ``app.main`` — that route must be blocked at the reverse
proxy in production; the flag alone does not restrict access.
"""

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram

from app.core.config import settings

registry = CollectorRegistry()

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
    registry=registry,
)
worker_last_beat_age_seconds = Gauge(
    "rally_worker_last_beat_age_seconds",
    "Seconds since the worker's last heartbeat",
    ["worker"],
    registry=registry,
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
