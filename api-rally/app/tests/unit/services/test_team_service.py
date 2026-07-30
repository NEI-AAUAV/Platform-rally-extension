"""Unit tests for TeamService's pure scoring/validation logic — no DB, no
session. The DB-backed orchestration (add_checkpoint's transaction, locking,
classification recompute) is covered end to end via crud_team.add_checkpoint
in app/tests/integration/test_team_progression_postgres.py and
app/tests/crud/test_crud.py, which exercise the same code through the
CRUDTeam delegating wrapper.
"""

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.core.exceptions import RallyValidationError
from app.models.team import Team
from app.services.team_service import TeamService


class TestCalculateMinTimeScores:
    def test_returns_minimum_nonzero_score_per_checkpoint(self) -> None:
        # given
        teams = [
            Team(name="A", time_scores=[10, 20]),
            Team(name="B", time_scores=[5, 0]),
        ]

        # when
        result = TeamService.calculate_min_time_scores(teams)

        # then
        assert result[0] == 5
        # team B's index-1 score is 0 ("no score yet", treated as infinity),
        # so team A's 20 is the only real value and wins the min.
        assert result[1] == 20

    def test_all_zero_scores_yield_infinity(self) -> None:
        # given
        teams = [Team(name="A", time_scores=[0]), Team(name="B", time_scores=[0])]

        # when
        result = TeamService.calculate_min_time_scores(teams)

        # then
        assert result[0] == float("inf")


class TestCalculateCheckpointScore:
    def test_combines_time_question_puke_and_skip_components(self) -> None:
        # given
        team = Team(name="A", time_scores=[100], question_scores=[True], pukes=[1], skips=[2])

        # when
        score = TeamService.calculate_checkpoint_score(
            0, team=team, min_time_scores=[50], penalty_per_puke=-20
        )

        # then: time=int(50/100*10)=5, question=8, pukes=1*-20=-20, skips=2*-8=-16
        assert score == 5 + 8 - 20 - 16

    def test_negative_skips_are_a_bonus(self) -> None:
        # given
        team = Team(name="A", time_scores=[0], question_scores=[False], pukes=[0], skips=[-1])

        # when
        score = TeamService.calculate_checkpoint_score(
            0, team=team, min_time_scores=[0], penalty_per_puke=-20
        )

        # then: skips < 0 -> bonus abs(-1) * 4 = 4
        assert score == 4

    def test_zero_time_score_contributes_nothing(self) -> None:
        # given
        team = Team(name="A", time_scores=[0], question_scores=[True], pukes=[0], skips=[0])

        # when
        score = TeamService.calculate_checkpoint_score(
            0, team=team, min_time_scores=[50], penalty_per_puke=-20
        )

        # then: a score of 0 means "not yet timed" — no time component
        assert score == 8


class TestValidateRallyTiming:
    @pytest.fixture
    def service(self) -> TeamService:
        return TeamService(db=None, team_crud=None)  # both unused by this method

    def test_before_start_time_raises(self, service: TeamService) -> None:
        # given
        settings = SimpleNamespace(
            rally_start_time=datetime(2026, 1, 1, tzinfo=UTC),
            rally_end_time=None,
        )
        now = datetime(2025, 12, 31, tzinfo=UTC)

        # when / then
        with pytest.raises(RallyValidationError, match="not started yet"):
            service._validate_rally_timing(settings, now)

    def test_after_end_time_raises(self, service: TeamService) -> None:
        # given
        settings = SimpleNamespace(
            rally_start_time=None,
            rally_end_time=datetime(2026, 1, 1, tzinfo=UTC),
        )
        now = datetime(2026, 1, 2, tzinfo=UTC)

        # when / then
        with pytest.raises(RallyValidationError, match="has ended"):
            service._validate_rally_timing(settings, now)

    def test_within_window_does_not_raise(self, service: TeamService) -> None:
        # given
        settings = SimpleNamespace(
            rally_start_time=datetime(2026, 1, 1, tzinfo=UTC),
            rally_end_time=datetime(2026, 1, 3, tzinfo=UTC),
        )
        now = datetime(2026, 1, 2, tzinfo=UTC)

        # when / then: no exception
        service._validate_rally_timing(settings, now)

    def test_no_timing_constraints_never_raises(self, service: TeamService) -> None:
        # given
        settings = SimpleNamespace(rally_start_time=None, rally_end_time=None)

        # when / then: no exception regardless of current time
        service._validate_rally_timing(settings, datetime.now(UTC))
