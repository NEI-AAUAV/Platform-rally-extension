"""Unit tests for the shared activity-coverage rule.

Exercises `checkpoint_ids_covered_by_activities` directly, isolated from the
validator/route-planning callers that consume it, so the coverage semantics
are pinned independently of how each caller filters/queries activities.
"""

from types import SimpleNamespace

from app.domain.event_configuration.activity_coverage import (
    checkpoint_ids_covered_by_activities,
)


def _activity(checkpoint_id: int | None = None, is_global: bool = False) -> SimpleNamespace:
    return SimpleNamespace(checkpoint_id=checkpoint_id, is_global=is_global)


def test_local_activity_covers_only_its_checkpoint():
    activities = [_activity(checkpoint_id=1)]
    covered = checkpoint_ids_covered_by_activities(activities, [1, 2, 3])
    assert covered == {1}


def test_multiple_local_activities_cover_their_own_checkpoints():
    activities = [_activity(checkpoint_id=1), _activity(checkpoint_id=2)]
    covered = checkpoint_ids_covered_by_activities(activities, [1, 2, 3])
    assert covered == {1, 2}


def test_one_global_activity_covers_all_checkpoints():
    activities = [_activity(checkpoint_id=None, is_global=True)]
    covered = checkpoint_ids_covered_by_activities(activities, [1, 2, 3])
    assert covered == {1, 2, 3}


def test_global_and_local_activities_together_cover_all_checkpoints():
    activities = [_activity(checkpoint_id=1), _activity(checkpoint_id=None, is_global=True)]
    covered = checkpoint_ids_covered_by_activities(activities, [1, 2, 3])
    assert covered == {1, 2, 3}


def test_no_activities_covers_nothing():
    covered = checkpoint_ids_covered_by_activities([], [1, 2, 3])
    assert covered == set()


def test_only_irrelevant_checkpoint_ids_covers_nothing():
    activities = [_activity(checkpoint_id=99)]
    covered = checkpoint_ids_covered_by_activities(activities, [1, 2, 3])
    assert covered == set()
