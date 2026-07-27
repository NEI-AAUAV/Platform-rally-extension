"""
Simple test to verify basic setup works
"""

from datetime import UTC, datetime


def test_basic_setup():
    """Test that basic Python setup works"""
    assert True


def test_datetime_utc():
    """Test UTC datetime handling"""
    now = datetime.now(UTC)
    assert now.tzinfo is not None
    assert now.tzinfo.utcoffset(now).total_seconds() == 0


def test_timezone_conversion():
    """Test timezone conversion logic"""
    # Test that we can create datetime objects
    start_time = datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC)
    end_time = datetime(2024, 1, 15, 18, 0, 0, tzinfo=UTC)

    assert start_time < end_time
    assert (end_time - start_time).total_seconds() == 8 * 3600  # 8 hours
