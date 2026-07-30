"""Unit tests for VersusService.build_pair_list — no DB needed. The HTTP-level
happy path is covered in app/tests/api/test_versus.py; this fills the gap on
incomplete groups (only one team) and teams with no group at all.
"""

from app.models.team import Team
from app.services.versus_service import VersusService


class TestBuildPairList:
    def test_two_teams_in_same_group_form_a_pair(self) -> None:
        # given
        team_a = Team(id=1, name="A", versus_group_id=5)
        team_b = Team(id=2, name="B", versus_group_id=5)

        # when
        pairs = VersusService.build_pair_list([team_a, team_b])

        # then
        assert len(pairs) == 1
        assert pairs[0].group_id == 5
        assert {pairs[0].team_a_id, pairs[0].team_b_id} == {1, 2}

    def test_incomplete_group_with_one_team_is_excluded(self) -> None:
        # given: only one team ever joined group 5 (opponent not yet paired)
        lone_team = Team(id=1, name="A", versus_group_id=5)

        # when
        pairs = VersusService.build_pair_list([lone_team])

        # then
        assert pairs == []

    def test_teams_without_a_group_are_ignored(self) -> None:
        # given
        ungrouped = Team(id=1, name="A", versus_group_id=None)

        # when
        pairs = VersusService.build_pair_list([ungrouped])

        # then
        assert pairs == []

    def test_multiple_groups_each_produce_their_own_pair(self) -> None:
        # given
        teams = [
            Team(id=1, name="A", versus_group_id=1),
            Team(id=2, name="B", versus_group_id=1),
            Team(id=3, name="C", versus_group_id=2),
            Team(id=4, name="D", versus_group_id=2),
        ]

        # when
        pairs = VersusService.build_pair_list(teams)

        # then
        assert len(pairs) == 2
        assert {p.group_id for p in pairs} == {1, 2}

    def test_group_with_three_teams_is_excluded(self) -> None:
        # given: a data anomaly — three teams sharing one group id
        teams = [
            Team(id=1, name="A", versus_group_id=9),
            Team(id=2, name="B", versus_group_id=9),
            Team(id=3, name="C", versus_group_id=9),
        ]

        # when
        pairs = VersusService.build_pair_list(teams)

        # then: only exactly-2-team groups count as a valid pair
        assert pairs == []
