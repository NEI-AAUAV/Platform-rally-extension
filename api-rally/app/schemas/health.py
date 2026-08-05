"""Schemas for the readiness probe and the admin metrics panel."""

from pydantic import BaseModel


class WorkerHealth(BaseModel):
    """Liveness of one background worker."""

    name: str
    alive: bool
    last_beat: float


class Readiness(BaseModel):
    """Aggregated dependency health.

    ``redis`` is absent when the realtime subsystem is disabled, in which case
    no Redis connection is expected and its state says nothing about
    readiness.
    """

    status: str
    db: str
    redis: str | None = None
    workers: list[WorkerHealth]


class MetricsSummary(BaseModel):
    """Prometheus counters aggregated for the admin panel.

    ``request_duration_seconds_sum`` / ``_count`` are the raw histogram
    accumulators rather than a pre-computed average: the panel diffs
    successive polls to derive the latency of the interval between them,
    which the average alone cannot express.
    """

    requests_total: float
    errors_5xx: float
    rate_limit_rejections: float
    request_duration_seconds_sum: float
    request_duration_seconds_count: float
