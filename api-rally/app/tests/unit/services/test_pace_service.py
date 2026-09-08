from datetime import UTC, datetime

from app.services.pace_service import TeamPace, rank_paces, team_start_time

NOW = datetime(2026, 1, 1, 10, tzinfo=UTC)


def _pace(team_id: int, resolved: int, elapsed: float | None) -> TeamPace:
    return TeamPace(team_id, NOW, NOW, elapsed, resolved, 4, False, 0)


def test_team_start_time_is_first_arrival():
    assert team_start_time(NOW) == NOW


def test_team_start_time_is_none_without_any_arrival():
    assert team_start_time(None) is None


def test_team_start_time_normalizes_naive_arrival_to_utc():
    assert team_start_time(NOW.replace(tzinfo=None)) == NOW


def test_pace_ranking_prioritizes_progress_then_time_and_unranks_no_progress():
    ranked = rank_paces([_pace(1, 1, 10), _pace(2, 2, 100), _pace(3, 2, 20), _pace(4, 0, 1)])
    assert [pace.team_id for pace in ranked] == [3, 2, 1, 4]
    assert [pace.rank for pace in ranked] == [1, 2, 3, 0]


def test_missing_or_negative_elapsed_sorts_after_valid_progress_time():
    ranked = rank_paces([_pace(1, 1, None), _pace(2, 1, 0)])
    assert [pace.team_id for pace in ranked] == [2, 1]
