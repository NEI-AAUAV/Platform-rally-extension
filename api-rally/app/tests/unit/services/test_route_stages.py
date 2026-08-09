"""Unit tests for the stage progression rules and per-post opening hours."""

from datetime import UTC, datetime

import pytest

from app.services.route_stages import (
    Stage,
    build_stages,
    is_open_at,
    is_reachable_in_stages,
    is_stage_complete,
    opening_state,
    resolved_in_stage,
)

# The shape the planning document actually has: a university block walked in
# order, then a set of bars where the team picks three.
UNIVERSITY = Stage(
    id=1, order=1, order_matters=True, required_count=None, checkpoint_orders=(1, 2, 3)
)
BARS = Stage(id=2, order=2, order_matters=False, required_count=3, checkpoint_orders=(4, 5, 6, 7))
ROUTE = [UNIVERSITY, BARS]


def reachable(order: int, resolved: set[int], stages: list[Stage] | None = None) -> bool:
    return is_reachable_in_stages(
        checkpoint_order=order,
        stages=stages if stages is not None else ROUTE,
        resolved_orders=frozenset(resolved),
    )


class TestOrderedStage:
    def test_first_post_is_reachable_from_the_start(self) -> None:
        assert reachable(1, set())

    def test_second_post_waits_for_the_first(self) -> None:
        assert not reachable(2, set())
        assert reachable(2, {1})

    def test_a_resolved_post_is_not_reachable_again(self) -> None:
        assert not reachable(1, {1})


class TestFreeStage:
    def test_bars_stay_locked_until_the_university_block_is_done(self) -> None:
        assert not reachable(4, {1, 2})
        assert reachable(4, {1, 2, 3})

    def test_any_unvisited_bar_is_fair_game(self) -> None:
        resolved = {1, 2, 3, 5}

        assert reachable(4, resolved)
        assert reachable(6, resolved)
        assert reachable(7, resolved)
        assert not reachable(5, resolved)

    def test_a_free_stage_does_not_care_which_bars_were_picked(self) -> None:
        # Two bars done, in reverse order — the third is still reachable.
        assert reachable(4, {1, 2, 3, 6, 7})


class TestStageCompletion:
    def test_a_partial_stage_counts_only_its_own_posts(self) -> None:
        assert resolved_in_stage(BARS, frozenset({1, 2, 3, 4})) == 1

    def test_required_count_lets_a_stage_finish_early(self) -> None:
        assert is_stage_complete(BARS, frozenset({4, 5, 6}))
        assert not is_stage_complete(BARS, frozenset({4, 5}))

    def test_required_none_means_every_post(self) -> None:
        assert not is_stage_complete(UNIVERSITY, frozenset({1, 2}))
        assert is_stage_complete(UNIVERSITY, frozenset({1, 2, 3}))

    def test_required_count_larger_than_the_stage_is_clamped(self) -> None:
        # An admin typo must not strand the route behind a stage that can
        # never be finished.
        greedy = Stage(
            id=3, order=1, order_matters=False, required_count=99, checkpoint_orders=(1, 2)
        )

        assert greedy.required == 2
        assert is_stage_complete(greedy, frozenset({1, 2}))

    def test_required_count_zero_opens_the_next_stage_immediately(self) -> None:
        optional = Stage(
            id=3, order=1, order_matters=False, required_count=0, checkpoint_orders=(1, 2)
        )

        assert is_stage_complete(optional, frozenset())


class TestUnstagedPosts:
    def test_a_post_in_no_stage_is_left_to_the_caller(self) -> None:
        assert reachable(9, set())

    def test_an_empty_route_reaches_everything(self) -> None:
        assert reachable(1, set(), stages=[])


class TestBuildStages:
    def test_orders_stages_and_attaches_their_posts(self) -> None:
        stages = build_stages(
            [(2, 2, False, 3), (1, 1, True, None)],
            {1: [3, 1, 2], 2: [7, 4]},
        )

        assert [s.id for s in stages] == [1, 2]
        assert stages[0].checkpoint_orders == (1, 2, 3)
        assert stages[1].order_matters is False
        assert stages[1].required_count == 3

    def test_a_stage_with_no_posts_yet_is_still_a_stage(self) -> None:
        stages = build_stages([(1, 1, True, None)], {})

        assert stages[0].checkpoint_orders == ()
        assert stages[0].required == 0


def at(hour: int) -> datetime:
    return datetime(2026, 8, 9, hour, 0, tzinfo=UTC)


class TestOpeningHours:
    def test_a_post_without_hours_is_always_open(self) -> None:
        assert is_open_at(available_from=None, available_until=None, now=at(6))

    def test_closed_before_opening(self) -> None:
        assert not is_open_at(available_from=at(22), available_until=None, now=at(18))
        assert is_open_at(available_from=at(22), available_until=None, now=at(23))

    def test_closed_after_closing(self) -> None:
        assert is_open_at(available_from=None, available_until=at(2), now=at(1))
        assert not is_open_at(available_from=None, available_until=at(2), now=at(3))

    @pytest.mark.parametrize(
        ("now", "expected"),
        [
            (datetime(2026, 8, 9, 18, tzinfo=UTC), "not_yet"),
            (datetime(2026, 8, 9, 23, tzinfo=UTC), "open"),
            (datetime(2026, 8, 10, 3, tzinfo=UTC), "closed"),
        ],
    )
    def test_state_distinguishes_waiting_from_missing_it(
        self, now: datetime, expected: str
    ) -> None:
        # A bar's window runs past midnight, so the closing bound belongs to
        # the next day — "closed" is 3am tomorrow, not 3am today.
        state = opening_state(
            available_from=at(22),
            available_until=datetime(2026, 8, 10, 2, tzinfo=UTC),
            now=now,
        )

        assert state == expected
