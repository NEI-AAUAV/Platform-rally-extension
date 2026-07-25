"""Unit tests for GeneralActivity (app.models.activities.general) — pure
logic, no DB needed.
"""

import pytest

from app.models.activities.general import GeneralActivity


def _activity(**config_overrides):
    config = {"min_points": 0, "max_points": 100}
    config.update(config_overrides)
    return GeneralActivity(config=config)


def test_get_type_returns_general_activity() -> None:
    assert GeneralActivity.get_type() == "GeneralActivity"


def test_persisted_score_fields_extracts_assigned_points() -> None:
    activity = _activity()

    assert activity.persisted_score_fields({"assigned_points": 42}) == {"points_score": 42}


def test_calculate_score_clamps_below_minimum() -> None:
    activity = _activity(min_points=10, max_points=100)

    score = activity.calculate_score({"assigned_points": 5})

    assert score == pytest.approx(10.0)


def test_calculate_score_clamps_above_maximum() -> None:
    activity = _activity(min_points=0, max_points=50)

    score = activity.calculate_score({"assigned_points": 75})

    assert score == pytest.approx(50.0)


async def test_validate_result_missing_assigned_points_is_invalid() -> None:
    activity = _activity()

    assert await activity.validate_result({}) is False


async def test_validate_result_non_numeric_assigned_points_is_invalid() -> None:
    activity = _activity()

    assert await activity.validate_result({"assigned_points": "not-a-number"}) is False


async def test_validate_result_within_range_is_valid() -> None:
    activity = _activity(min_points=0, max_points=100)

    assert await activity.validate_result({"assigned_points": 42}) is True


async def test_validate_result_outside_range_is_invalid() -> None:
    activity = _activity(min_points=0, max_points=10)

    assert await activity.validate_result({"assigned_points": 999}) is False


def test_get_result_schema_uses_configured_bounds() -> None:
    activity = _activity(min_points=5, max_points=95)

    schema = activity.get_result_schema()

    assert schema["properties"]["assigned_points"]["minimum"] == 5
    assert schema["properties"]["assigned_points"]["maximum"] == 95
    assert schema["required"] == ["assigned_points"]
