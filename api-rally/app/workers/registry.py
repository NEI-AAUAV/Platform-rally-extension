"""Process-wide registry of the running background workers.

Lives here rather than in ``app.main`` so the readiness route
(``app.api.api_v1.health``) can read worker liveness without importing the
application module — that import direction would be circular.
"""

from app.workers.base import BaseWorker

_workers: list[BaseWorker] = []


def register_worker(worker: BaseWorker) -> None:
    """Record a worker started by the application lifespan."""
    _workers.append(worker)


def get_workers() -> tuple[BaseWorker, ...]:
    """Snapshot of the registered workers, in start order."""
    return tuple(_workers)


def clear_workers() -> None:
    """Drop every registered worker (called on shutdown)."""
    _workers.clear()
