"""Unit tests for the leg-time bonus/penalty formula."""

from app.services.leg_time_service import leg_time_points


class TestLegTimePoints:
    def test_faster_than_target_gives_a_bonus(self) -> None:
        points = leg_time_points(
            leg_minutes=5, target_minutes=10, points_per_minute=2, max_adjustment=100
        )
        assert points == 10  # 5 min under target * 2 pts/min

    def test_slower_than_target_gives_a_penalty(self) -> None:
        points = leg_time_points(
            leg_minutes=15, target_minutes=10, points_per_minute=2, max_adjustment=100
        )
        assert points == -10  # 5 min over target * 2 pts/min

    def test_exactly_on_target_gives_zero(self) -> None:
        points = leg_time_points(
            leg_minutes=10, target_minutes=10, points_per_minute=2, max_adjustment=100
        )
        assert points == 0

    def test_bonus_is_capped_at_max_adjustment(self) -> None:
        points = leg_time_points(
            leg_minutes=0, target_minutes=10, points_per_minute=5, max_adjustment=20
        )
        assert points == 20  # would be 50 uncapped

    def test_penalty_is_capped_at_negative_max_adjustment(self) -> None:
        points = leg_time_points(
            leg_minutes=100, target_minutes=10, points_per_minute=5, max_adjustment=20
        )
        assert points == -20  # would be -450 uncapped

    def test_zero_points_per_minute_is_a_no_op(self) -> None:
        # The "cost of 0 means off" convention: a team could take forever or
        # arrive instantly, both score 0 when the rate isn't set.
        assert (
            leg_time_points(
                leg_minutes=1, target_minutes=10, points_per_minute=0, max_adjustment=100
            )
            == 0.0
        )

    def test_negative_points_per_minute_is_a_no_op(self) -> None:
        assert (
            leg_time_points(
                leg_minutes=1, target_minutes=10, points_per_minute=-5, max_adjustment=100
            )
            == 0.0
        )

    def test_zero_max_adjustment_is_a_no_op(self) -> None:
        assert (
            leg_time_points(leg_minutes=1, target_minutes=10, points_per_minute=5, max_adjustment=0)
            == 0.0
        )
