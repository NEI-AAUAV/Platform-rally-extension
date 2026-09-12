"""Unit tests for TeamService's pure scoring/validation logic — no DB, no
session. The DB-backed visit validation (``validate_visit``) is covered end to
end via ``checkpoint_visits.record_visit`` in
app/tests/integration/test_team_progression_postgres.py.
"""

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.core.exceptions import RallyValidationError
from app.services.team_service import TeamService


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
