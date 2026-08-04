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

    for metric in registry.collect():
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
