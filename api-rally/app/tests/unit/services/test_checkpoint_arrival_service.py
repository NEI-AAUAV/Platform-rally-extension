"""Unit tests for the pure pieces of the GPS-arrival path — no DB, no session.

The DB-backed orchestration (idempotent insert, auto-advance, event scoping) is
covered end to end in app/tests/api/test_checkpoint_arrive.py against a real
Postgres; what lives here is the logic that decides *what* those paths do:
the coarse distance banding and the progression predicate they share with
TeamService.add_checkpoint.
"""

import pytest

from app.services.checkpoint_arrival_service import _distance_bucket
from app.services.team_service import is_checkpoint_reachable


class TestDistanceBucket:
    """A rejection must never carry the exact metre count: in focused route
    mode that would let a team trilaterate a post it is not allowed to see.
    """

    @pytest.mark.parametrize(
        ("distance", "expected"),
        [
            (0.0, "menos de 100m"),
            (99.9, "menos de 100m"),
            (100.0, "menos de 500m"),
            (499.9, "menos de 500m"),
            (500.0, "menos de 2km"),
            (1_999.9, "menos de 2km"),
            (2_000.0, "mais de 2km"),
            (50_000.0, "mais de 2km"),
        ],
    )
    def test_buckets_are_coarse_and_contiguous(self, distance: float, expected: str) -> None:
        assert _distance_bucket(distance) == expected

    def test_never_echoes_the_exact_distance(self) -> None:
        # given a distance whose metre count would be a useful leak
        distance = 237.4

        # when
        label = _distance_bucket(distance)

        # then
        assert "237" not in label


class TestIsCheckpointReachable:
    """Shared predicate: the GPS auto-advance guard and add_checkpoint's
    validation must agree, or a team gets stranded at a no-activity post.
    """

    @pytest.mark.parametrize(
        ("checkpoint_order", "expected"),
        [(1, False), (2, False), (3, True), (4, False)],
    )
    def test_strict_order_admits_only_the_next_post(
        self, checkpoint_order: int, expected: bool
    ) -> None:
        result = is_checkpoint_reachable(
            checkpoint_order=checkpoint_order, times_reached=2, order_matters=True
        )

        assert result is expected

    @pytest.mark.parametrize(
        ("checkpoint_order", "expected"),
        [(1, False), (2, False), (3, True), (4, True)],
    )
    def test_free_order_admits_any_unvisited_post(
        self, checkpoint_order: int, expected: bool
    ) -> None:
        result = is_checkpoint_reachable(
            checkpoint_order=checkpoint_order, times_reached=2, order_matters=False
        )

        assert result is expected

    def test_first_post_is_reachable_from_zero_progress_in_both_modes(self) -> None:
        for order_matters in (True, False):
            assert is_checkpoint_reachable(
                checkpoint_order=1, times_reached=0, order_matters=order_matters
            )
