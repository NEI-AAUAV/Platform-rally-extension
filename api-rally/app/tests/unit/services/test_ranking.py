"""Unit tests for the linear rank-to-points formula."""

import pytest

from app.services.ranking import linear_rank_points


class TestLinearRankPoints:
    def test_first_place_gets_max_points(self) -> None:
        assert linear_rank_points(rank=1, total=5, max_points=100, min_points=0) == 100

    def test_last_place_gets_min_points(self) -> None:
        assert linear_rank_points(rank=5, total=5, max_points=100, min_points=0) == 0

    def test_middle_ranks_interpolate_linearly(self) -> None:
        # 5 entries, 0..100: ranks 1..5 map to 100, 75, 50, 25, 0.
        assert linear_rank_points(rank=3, total=5, max_points=100, min_points=0) == 50
        assert linear_rank_points(rank=2, total=5, max_points=100, min_points=0) == 75
        assert linear_rank_points(rank=4, total=5, max_points=100, min_points=0) == 25

    def test_a_single_entry_gets_max_points(self) -> None:
        # Nothing to compare against — "first place" is the only judgment.
        assert linear_rank_points(rank=1, total=1, max_points=100, min_points=0) == 100

    def test_two_entries_split_evenly(self) -> None:
        assert linear_rank_points(rank=1, total=2, max_points=100, min_points=0) == 100
        assert linear_rank_points(rank=2, total=2, max_points=100, min_points=0) == 0

    def test_respects_a_nonzero_min_points_floor(self) -> None:
        assert linear_rank_points(rank=5, total=5, max_points=100, min_points=20) == 20
        assert linear_rank_points(rank=3, total=5, max_points=100, min_points=20) == 60

    @pytest.mark.parametrize("total", [3, 4, 6, 10])
    def test_rank_1_always_hits_max_points_regardless_of_field_size(self, total: int) -> None:
        assert linear_rank_points(rank=1, total=total, max_points=100, min_points=0) == 100
