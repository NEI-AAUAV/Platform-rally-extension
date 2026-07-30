"""Unit tests for round-robin schedule generator (D2)."""

from app.utils.round_robin import generate_schedule


def test_empty_inputs():
    assert generate_schedule([], [1, 2]) == []
    assert generate_schedule([1, 2], []) == []


def test_equal_teams_and_checkpoints():
    teams = [1, 2, 3]
    checkpoints = [10, 20, 30]
    schedule = generate_schedule(teams, checkpoints)
    # max(3,3) = 3 rounds
    assert len(schedule) == 3
    # Each round has one entry per team
    for round_ in schedule:
        assert len(round_) == 3
        assigned_teams = [a["team_id"] for a in round_]
        assert set(assigned_teams) == set(teams)


def test_more_teams_than_checkpoints():
    teams = [1, 2, 3, 4]
    checkpoints = [10, 20]
    schedule = generate_schedule(teams, checkpoints)
    # max(4, 2) = 4 rounds
    assert len(schedule) == 4
    for round_ in schedule:
        assert len(round_) == 4


def test_more_checkpoints_than_teams():
    teams = [1, 2]
    checkpoints = [10, 20, 30, 40]
    schedule = generate_schedule(teams, checkpoints)
    # max(2, 4) = 4 rounds
    assert len(schedule) == 4
    for round_ in schedule:
        assert len(round_) == 2


def test_all_checkpoints_visited():
    teams = [1, 2, 3]
    checkpoints = [10, 20, 30]
    schedule = generate_schedule(teams, checkpoints)
    visited = {(a["team_id"], a["checkpoint_id"]) for r in schedule for a in r}
    # Every team visits every checkpoint
    for t in teams:
        for c in checkpoints:
            assert (t, c) in visited


def test_single_team():
    schedule = generate_schedule([1], [10, 20, 30])
    assert len(schedule) == 3
    for i, round_ in enumerate(schedule):
        assert round_[0]["team_id"] == 1
        assert round_[0]["checkpoint_id"] == [10, 20, 30][i]
