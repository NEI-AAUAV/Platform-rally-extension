"""Ranked mode of ScoreBasedActivity: higher achieved points rank first."""

import pytest

from app.models.activities.score_based import ScoreBasedActivity


def _ranked(max_points: int = 10, min_points: int = 0) -> ScoreBasedActivity:
    return ScoreBasedActivity(
        {"rank_by_score": True, "max_points": max_points, "min_points": min_points}
    )


def test_only_the_highest_score_gets_max_points() -> None:
    scores = [1.0, 4.0, 9.0]

    assert _ranked().calculate_relative_ranking_score(scores, 9.0) == pytest.approx(10.0)


def test_lowest_score_gets_min_points() -> None:
    scores = [1.0, 4.0, 9.0]

    assert _ranked().calculate_relative_ranking_score(scores, 1.0) == pytest.approx(0.0)


def test_middle_positions_are_linear_between_max_and_min() -> None:
    scores = [1.0, 4.0, 9.0]

    assert _ranked().calculate_relative_ranking_score(scores, 4.0) == pytest.approx(5.0)


def test_teams_tied_for_first_all_get_max_points() -> None:
    scores = [2.0, 7.0, 7.0]

    assert _ranked().calculate_relative_ranking_score(scores, 7.0) == pytest.approx(10.0)


def test_teams_tied_for_last_all_get_min_points() -> None:
    scores = [2.0, 2.0, 7.0]

    assert _ranked().calculate_relative_ranking_score(scores, 2.0) == pytest.approx(0.0)


def test_min_points_defaults_to_zero_when_not_configured() -> None:
    activity = ScoreBasedActivity({"rank_by_score": True, "max_points": 10})

    assert activity.calculate_relative_ranking_score([1.0, 9.0], 1.0) == pytest.approx(0.0)


def test_score_outside_the_field_gets_nothing() -> None:
    assert _ranked().calculate_relative_ranking_score([1.0, 9.0], 5.0) == 0.0
