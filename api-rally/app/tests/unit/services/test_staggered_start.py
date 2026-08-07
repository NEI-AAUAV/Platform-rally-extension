"""Unit tests for staggered starts — no DB, no session.

Every team walks the same route; the offset only moves when a given team is
allowed to set off, so departures spread out instead of the whole field
standing at post 1 copying each other.
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.core.exceptions import RallyValidationError
from app.services.team_service import validate_rally_timing

START = datetime(2026, 8, 6, 14, 0, tzinfo=UTC)
END = datetime(2026, 8, 6, 18, 0, tzinfo=UTC)


def _settings(start=START, end=END) -> SimpleNamespace:
    return SimpleNamespace(rally_start_time=start, rally_end_time=end)


class TestStaggeredStart:
    def test_zero_offset_behaves_exactly_as_before(self) -> None:
        # given a team that starts with everyone else
        validate_rally_timing(_settings(), START, start_offset_minutes=0)

        settings = _settings()
        check_time = START - timedelta(minutes=1)
        with pytest.raises(RallyValidationError, match="has not started"):
            validate_rally_timing(settings, check_time, start_offset_minutes=0)

    def test_offset_team_is_rejected_before_its_own_start(self) -> None:
        # given a team due to leave 20 minutes after the gun
        # when it tries to check in at the event start
        settings = _settings()
        with pytest.raises(RallyValidationError, match="has not started"):
            validate_rally_timing(settings, START, start_offset_minutes=20)

    def test_offset_team_is_admitted_at_its_own_start(self) -> None:
        validate_rally_timing(_settings(), START + timedelta(minutes=20), start_offset_minutes=20)

    def test_rejection_names_the_team_s_own_start_time(self) -> None:
        settings = _settings()
        with pytest.raises(RallyValidationError) as excinfo:
            validate_rally_timing(settings, START, start_offset_minutes=30)

        # The team should be told 14:30, not the event's 14:00.
        assert "14:30" in str(excinfo.value)

    def test_offset_does_not_extend_the_end_of_the_event(self) -> None:
        # The end time is the hard boundary (a venue closing, typically): a
        # late start does not buy extra time at the other end.
        settings = _settings()
        check_time = END + timedelta(minutes=1)
        with pytest.raises(RallyValidationError, match="has ended"):
            validate_rally_timing(settings, check_time, start_offset_minutes=30)

    def test_offset_is_inert_without_a_configured_start_time(self) -> None:
        # An event with no window at all stays open regardless of the offset.
        validate_rally_timing(_settings(start=None, end=None), START, start_offset_minutes=45)
