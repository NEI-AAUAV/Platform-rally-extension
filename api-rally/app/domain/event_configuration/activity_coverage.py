"""Shared activity-coverage semantics for readiness and route planning."""

from collections.abc import Iterable


def checkpoint_ids_covered_by_activities(
    activities: Iterable[object], checkpoint_ids: Iterable[int]
) -> set[int]:
    """Return checkpoints covered by an activity: either one assigned directly
    to the checkpoint, or any global activity (``is_global=True``, which
    applies across every checkpoint by definition). Callers are responsible
    for passing only the activities relevant to "coverage" (typically active
    ones) — this function does not filter on ``is_active`` itself, so the
    same activity list can serve differently-scoped callers consistently.
    """
    checkpoint_id_set = set(checkpoint_ids)
    if any(getattr(activity, "is_global", False) for activity in activities):
        return set(checkpoint_id_set)
    return {
        checkpoint_id
        for activity in activities
        if (checkpoint_id := getattr(activity, "checkpoint_id", None)) is not None
        and checkpoint_id in checkpoint_id_set
    }
