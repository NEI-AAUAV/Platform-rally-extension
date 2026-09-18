"""Shared activity-coverage semantics for readiness and route planning."""

from collections.abc import Iterable


def checkpoint_ids_covered_by_activities(
    activities: Iterable[object], checkpoint_ids: Iterable[int]
) -> set[int]:
    """Return checkpoints with an activity specifically assigned to them."""
    checkpoint_id_set = set(checkpoint_ids)
    return {
        checkpoint_id
        for activity in activities
        if (checkpoint_id := getattr(activity, "checkpoint_id", None)) is not None
        and checkpoint_id in checkpoint_id_set
    }
