"""Shared activity-coverage semantics for readiness and route planning."""

from collections.abc import Iterable


def checkpoint_ids_covered_by_activities(
    activities: Iterable[object], checkpoint_ids: Iterable[int]
) -> set[int]:
    """Return covered checkpoints; one global activity covers the whole route."""
    checkpoint_id_set = set(checkpoint_ids)
    activities = list(activities)
    if any(getattr(activity, "is_global", False) is True for activity in activities):
        return checkpoint_id_set
    return {
        checkpoint_id
        for activity in activities
        if (checkpoint_id := getattr(activity, "checkpoint_id", None)) is not None
        and checkpoint_id in checkpoint_id_set
    }
