"""Unit tests for RallyDurationCalculator (pure timing logic, no DB needed)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.utils.rally_duration import (
    RallyDurationCalculator,
    get_rally_duration_info,
    get_team_duration_info,
)

NOW = datetime.now(timezone.utc)


def _settings(start=None, end=None):
    return SimpleNamespace(rally_start_time=start, rally_end_time=end)


class TestGetRallyStatus:
    def test_no_start_time_configured(self):
        calc = RallyDurationCalculator(db=None, settings=_settings())
        status = calc.get_rally_status()
        assert status["status"] == "no_start_time"

    def test_not_started_when_before_start(self):
        start = NOW + timedelta(hours=1)
        calc = RallyDurationCalculator(db=None, settings=_settings(start=start))
        status = calc.get_rally_status()
        assert status["status"] == "not_started"
        assert status["time_until_start"] is not None

    def test_ended_when_after_end(self):
        start = NOW - timedelta(hours=2)
        end = NOW - timedelta(hours=1)
        calc = RallyDurationCalculator(db=None, settings=_settings(start=start, end=end))
        status = calc.get_rally_status()
        assert status["status"] == "ended"
        assert status["total_duration"] is not None
        assert status["time_since_end"] is not None

    def test_active_no_end_time(self):
        start = NOW - timedelta(hours=1)
        calc = RallyDurationCalculator(db=None, settings=_settings(start=start))
        status = calc.get_rally_status()
        assert status["status"] == "active_no_end"
        assert status["time_elapsed"] is not None

    def test_active_with_end_time_includes_progress(self):
        start = NOW - timedelta(hours=1)
        end = NOW + timedelta(hours=1)
        calc = RallyDurationCalculator(db=None, settings=_settings(start=start, end=end))
        status = calc.get_rally_status()
        assert status["status"] == "active"
        assert 0 <= status["progress_percentage"] <= 100


class TestGetTeamRallyDuration:
    def test_error_when_no_rally_start_configured(self):
        calc = RallyDurationCalculator(db=None, settings=_settings())
        result = calc.get_team_rally_duration(NOW)
        assert result == {"error": "No rally start time configured"}

    def test_normalizes_naive_team_start_time(self):
        start = NOW - timedelta(hours=2)
        calc = RallyDurationCalculator(db=None, settings=_settings(start=start))
        naive_team_start = (NOW - timedelta(hours=1)).replace(tzinfo=None)

        result = calc.get_team_rally_duration(naive_team_start)

        assert result["team_start_time"] is not None
        assert result["team_duration_seconds"] >= 0

    def test_includes_total_rally_duration_when_end_set(self):
        start = NOW - timedelta(hours=2)
        end = NOW + timedelta(hours=2)
        calc = RallyDurationCalculator(db=None, settings=_settings(start=start, end=end))

        result = calc.get_team_rally_duration(start)

        assert result["total_rally_duration"] is not None
        assert result["total_rally_duration_seconds"] == pytest.approx(14400.0)

    def test_omits_total_rally_duration_when_end_missing(self):
        start = NOW - timedelta(hours=2)
        calc = RallyDurationCalculator(db=None, settings=_settings(start=start))

        result = calc.get_team_rally_duration(start)

        assert result["total_rally_duration"] is None
        assert result["total_rally_duration_seconds"] is None


class TestIsWithinRallyTime:
    def test_false_when_no_start_configured(self):
        calc = RallyDurationCalculator(db=None, settings=_settings())
        assert calc._is_within_rally_time(NOW) is False

    def test_false_when_before_start(self):
        start = NOW
        calc = RallyDurationCalculator(db=None, settings=_settings(start=start))
        assert calc._is_within_rally_time(start - timedelta(minutes=1)) is False

    def test_false_when_after_end(self):
        start = NOW - timedelta(hours=1)
        end = NOW
        calc = RallyDurationCalculator(db=None, settings=_settings(start=start, end=end))
        assert calc._is_within_rally_time(end + timedelta(minutes=1)) is False

    def test_true_when_within_bounds(self):
        start = NOW - timedelta(hours=1)
        end = NOW + timedelta(hours=1)
        calc = RallyDurationCalculator(db=None, settings=_settings(start=start, end=end))
        assert calc._is_within_rally_time(NOW) is True


class TestFormatDuration:
    def test_formats_days_hours_minutes_seconds(self):
        calc = RallyDurationCalculator(db=None, settings=_settings())
        duration = timedelta(days=1, hours=2, minutes=3, seconds=4)
        assert calc._format_duration(duration) == "1d 2h 3m 4s"

    def test_formats_zero_duration_as_zero_seconds(self):
        calc = RallyDurationCalculator(db=None, settings=_settings())
        assert calc._format_duration(timedelta(seconds=0)) == "0s"

    def test_returns_none_for_none_duration(self):
        """Defensive guard: no real caller passes None (type hint says
        timedelta), but the function still handles it explicitly."""
        calc = RallyDurationCalculator(db=None, settings=_settings())
        assert calc._format_duration(None) is None


class TestCalculateProgressPercentage:
    def test_zero_total_duration_returns_zero(self):
        calc = RallyDurationCalculator(db=None, settings=_settings())
        pct = calc._calculate_progress_percentage(timedelta(seconds=0), timedelta(seconds=0))
        assert pct == pytest.approx(0.0)

    def test_caps_at_100(self):
        calc = RallyDurationCalculator(db=None, settings=_settings())
        pct = calc._calculate_progress_percentage(
            timedelta(hours=10), timedelta(hours=1)
        )
        assert pct == pytest.approx(100.0)


class TestConvenienceFunctions:
    async def test_get_rally_duration_info_uses_settings_and_calculator(self):
        settings = _settings(start=NOW - timedelta(hours=1))
        with patch(
            "app.utils.rally_duration.rally_settings.get_or_create",
            new=AsyncMock(return_value=settings),
        ):
            result = await get_rally_duration_info(db=None)
        assert result["status"] == "active_no_end"

    async def test_get_team_duration_info_uses_settings_and_calculator(self):
        settings = _settings(start=NOW - timedelta(hours=1))
        with patch(
            "app.utils.rally_duration.rally_settings.get_or_create",
            new=AsyncMock(return_value=settings),
        ):
            result = await get_team_duration_info(db=None, team_start_time=NOW)
        assert "team_duration" in result
