"""Unit tests for the pure pieces of the GPS-arrival path — no DB, no session.

The DB-backed orchestration (idempotent insert, auto-advance, event scoping) is
covered end to end in app/tests/api/test_checkpoint_arrive.py against a real
Postgres; what lives here is the logic that decides *what* those paths do:
the coarse distance banding and the progression predicate they share with
TeamService.add_checkpoint.
"""

from dataclasses import dataclass

import pytest

from app.services.checkpoint_arrival_service import _distance_bucket
from app.services.route_progress import _open_orders
from app.services.route_stages import Stage


@dataclass(frozen=True)
class _Cp:
    """The only two attributes ``_open_orders`` reads off a checkpoint row."""

    order: int
    name: str = ""


ROUTE = [_Cp(order=n) for n in range(1, 5)]


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


class TestOpenOrders:
    """The single reachability rule every write path shares. The GPS
    auto-advance guard, ``add_checkpoint``'s validation, the hint ladder and
    the give-up escape hatch all read this set, so they cannot disagree and
    strand a team at a post the screen told it to go to.
    """

    def test_strict_order_admits_only_the_first_unresolved_post(self) -> None:
        # given posts 1 and 2 resolved
        open_orders = _open_orders(
            checkpoints=ROUTE, resolved=frozenset({1, 2}), stages=[], order_matters=True
        )

        # then only post 3 is open
        assert open_orders == frozenset({3})

    def test_free_order_admits_every_unresolved_post(self) -> None:
        # given the team resolved post 3 first, out of sequence
        open_orders = _open_orders(
            checkpoints=ROUTE, resolved=frozenset({3}), stages=[], order_matters=False
        )

        # then every post it has not finished is fair game — including the
        # low-order ones, which the old count-based rule refused as soon as the
        # team's visit count passed their order.
        assert open_orders == frozenset({1, 2, 4})

    def test_strict_order_moves_on_after_a_give_up(self) -> None:
        # given the team gave up on post 1 (a skip resolves it)
        open_orders = _open_orders(
            checkpoints=ROUTE, resolved=frozenset({1}), stages=[], order_matters=True
        )

        # then the escape hatch actually lets them out
        assert open_orders == frozenset({2})

    @pytest.mark.parametrize("order_matters", [True, False])
    def test_first_post_is_open_from_zero_progress_in_both_modes(self, order_matters: bool) -> None:
        open_orders = _open_orders(
            checkpoints=ROUTE, resolved=frozenset(), stages=[], order_matters=order_matters
        )

        assert 1 in open_orders

    def test_nothing_is_open_once_every_post_is_resolved(self) -> None:
        open_orders = _open_orders(
            checkpoints=ROUTE, resolved=frozenset({1, 2, 3, 4}), stages=[], order_matters=True
        )

        assert open_orders == frozenset()

    def test_a_free_stage_opens_several_posts_at_once(self) -> None:
        # given one stage of four posts where the team picks any two
        stage = Stage(
            id=1, order=1, order_matters=False, required_count=2, checkpoint_orders=(1, 2, 3, 4)
        )

        open_orders = _open_orders(
            checkpoints=ROUTE, resolved=frozenset({2}), stages=[stage], order_matters=True
        )

        # then the remaining three are all open — the event-wide
        # `checkpoint_order_matters` does not override the stage's own rule
        assert open_orders == frozenset({1, 3, 4})

    def test_a_stage_required_count_unlocks_the_next_stage(self) -> None:
        first = Stage(
            id=1, order=1, order_matters=False, required_count=2, checkpoint_orders=(1, 2, 3)
        )
        second = Stage(
            id=2, order=2, order_matters=True, required_count=None, checkpoint_orders=(4,)
        )

        # given only one of the first stage's three posts done, the second
        # stage stays shut
        assert 4 not in _open_orders(
            checkpoints=ROUTE,
            resolved=frozenset({1}),
            stages=[first, second],
            order_matters=True,
        )

        # once the required two are done it opens, without needing the third
        assert 4 in _open_orders(
            checkpoints=ROUTE,
            resolved=frozenset({1, 2}),
            stages=[first, second],
            order_matters=True,
        )
