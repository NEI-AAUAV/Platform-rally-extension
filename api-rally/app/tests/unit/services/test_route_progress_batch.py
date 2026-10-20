"""Batched roster progress must agree with the per-team engine's pure core."""

from types import SimpleNamespace

from app.services.route_progress import RouteSnapshot, _progress_from_facts


def _route() -> RouteSnapshot:
    checkpoints = [SimpleNamespace(id=10 * n, order=n, name=f"Posto {n}") for n in (1, 2, 3)]
    activities = {
        10: [SimpleNamespace(id=1, is_active=True)],
        20: [SimpleNamespace(id=2, is_active=True)],
        30: [],
    }
    return RouteSnapshot(
        checkpoints=checkpoints, activities=activities, stages=[], order_matters=True
    )


def test_scored_and_skipped_posts_are_resolved_in_order() -> None:
    progress = _progress_from_facts(
        _route(),
        skipped_ids=frozenset({20}),
        arrived_ids=frozenset({10, 20}),
        scored_activity_ids=frozenset({1}),
    )

    assert progress.resolved_orders == frozenset({1, 2})
    assert progress.current_order == 3
    assert progress.last_completed_order == 2
    assert not progress.is_finished


def test_arrival_resolves_post_without_activities() -> None:
    progress = _progress_from_facts(
        _route(),
        skipped_ids=frozenset({10, 20}),
        arrived_ids=frozenset({30}),
        scored_activity_ids=frozenset(),
    )

    assert progress.is_finished
    assert progress.total_published == 3


def test_empty_route_has_no_progress() -> None:
    route = RouteSnapshot(checkpoints=[], activities={}, stages=[], order_matters=True)

    progress = _progress_from_facts(
        route, skipped_ids=frozenset(), arrived_ids=frozenset(), scored_activity_ids=frozenset()
    )

    assert progress.total_published == 0
    assert not progress.is_finished
