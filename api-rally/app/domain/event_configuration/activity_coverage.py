"""Shared activity-coverage semantics for readiness and route planning."""

from collections.abc import Iterable


def checkpoint_ids_covered_by_activities(
    activities: Iterable[object], checkpoint_ids: Iterable[int]
) -> set[int]:
    """Return the checkpoints that have a checkpoint-scoped activity.

    Only an activity assigned directly to a checkpoint (``checkpoint_id``
    set) covers it. Global activities (``is_global=True``, ``checkpoint_id``
    NULL) are event-wide: they still score, but checkpoint staff cannot
    evaluate them — ``validate_staff_checkpoint_access`` requires
    ``activity.checkpoint_id == staff_checkpoint_id`` and the staff activity
    listing is ``get_by_checkpoint`` — and ``ActivityResult`` allows a single
    result per (activity, team) for the whole event. Counting a global
    activity as covering every checkpoint would make readiness report posts
    as scoreable when staff there have nothing to evaluate.

    Callers are responsible for passing only the activities relevant to
    "coverage" (typically active ones) — this function does not filter on
    ``is_active`` itself, so the same activity list can serve
    differently-scoped callers consistently.
    """
    checkpoint_id_set = set(checkpoint_ids)
    return {
        checkpoint_id
        for activity in activities
        if not getattr(activity, "is_global", False)
        and (checkpoint_id := getattr(activity, "checkpoint_id", None)) is not None
        and checkpoint_id in checkpoint_id_set
    }
