"""Unit tests filling coverage gaps for simple activity model classes.

Covers: BooleanActivity, DeferredJudgedActivity, TimeBasedActivity,
ScoreBasedActivity, BaseActivity.apply_modifiers penalty branch, and the
draw/lose branches of TeamVsActivity.get_score_breakdown.
"""
from typing import Any, Dict, Optional

import pytest

from app.models.activities.base import BaseActivity
from app.models.activities.boolean import BooleanActivity
from app.models.activities.deferred_judged import DeferredJudgedActivity
from app.models.activities.score_based import ScoreBasedActivity
from app.models.activities.time_based import TimeBasedActivity
from app.models.activities.team_vs import TeamVsActivity


class TestBooleanActivity:
    def test_get_type(self):
        assert BooleanActivity.get_type() == "BooleanActivity"

    def test_persisted_score_fields(self):
        activity = BooleanActivity({})
        assert activity.persisted_score_fields({"success": True}) == {
            "boolean_score": True
        }

    def test_default_config(self):
        config = BooleanActivity.get_default_config()
        assert config == {"success_points": 100, "failure_points": 0}

    def test_calculate_score_success(self):
        activity = BooleanActivity({"success_points": 50})
        assert activity.calculate_score({"success": True}) == pytest.approx(50.0)

    def test_calculate_score_failure(self):
        activity = BooleanActivity({"failure_points": 5})
        assert activity.calculate_score({"success": False}) == pytest.approx(5.0)

    async def test_validate_result_true_when_success_present(self):
        activity = BooleanActivity({})
        assert await activity.validate_result({"success": True}) is True

    async def test_validate_result_false_when_missing(self):
        activity = BooleanActivity({})
        assert await activity.validate_result({}) is False

    def test_get_result_schema(self):
        activity = BooleanActivity({})
        schema = activity.get_result_schema()
        assert schema["required"] == ["success"]
        assert schema["properties"]["success"]["type"] == "boolean"


class TestDeferredJudgedActivity:
    def test_get_type(self):
        assert DeferredJudgedActivity.get_type() == "DeferredJudgedActivity"

    def test_persisted_score_fields(self):
        activity = DeferredJudgedActivity({})
        assert activity.persisted_score_fields({"points": 42}) == {
            "points_score": 42
        }

    def test_default_config(self):
        config = DeferredJudgedActivity.get_default_config()
        assert config == {"max_points": 100, "min_points": 0}

    def test_calculate_score(self):
        activity = DeferredJudgedActivity({})
        assert activity.calculate_score({"points": 33}) == pytest.approx(33.0)

    def test_calculate_score_defaults_to_zero(self):
        activity = DeferredJudgedActivity({})
        assert activity.calculate_score({}) == pytest.approx(0.0)

    async def test_validate_result_always_true(self):
        activity = DeferredJudgedActivity({})
        assert await activity.validate_result({}) is True
        assert await activity.validate_result({"points": 10}) is True

    def test_get_result_schema(self):
        activity = DeferredJudgedActivity({})
        schema = activity.get_result_schema()
        assert schema["type"] == "object"
        assert "points" in schema["properties"]


class TestTimeBasedActivityBasics:
    def test_get_type(self):
        assert TimeBasedActivity.get_type() == "TimeBasedActivity"

    def test_persisted_score_fields(self):
        activity = TimeBasedActivity({})
        assert activity.persisted_score_fields(
            {"completion_time_seconds": 12.5}
        ) == {"time_score": 12.5}

    def test_default_config(self):
        config = TimeBasedActivity.get_default_config()
        assert config == {"max_points": 100, "min_points": 10}

    def test_calculate_score_returns_raw_time(self):
        activity = TimeBasedActivity({})
        assert activity.calculate_score(
            {"completion_time_seconds": 45.0}
        ) == pytest.approx(45.0)

    def test_calculate_score_missing_time_returns_zero(self):
        activity = TimeBasedActivity({})
        assert activity.calculate_score({}) == 0

    async def test_validate_result_true_when_present(self):
        activity = TimeBasedActivity({})
        assert (
            await activity.validate_result({"completion_time_seconds": 10}) is True
        )

    async def test_validate_result_false_when_missing(self):
        activity = TimeBasedActivity({})
        assert await activity.validate_result({}) is False

    def test_get_result_schema(self):
        activity = TimeBasedActivity({})
        schema = activity.get_result_schema()
        assert schema["required"] == ["completion_time_seconds"]


class TestScoreBasedActivity:
    def test_get_type(self):
        assert ScoreBasedActivity.get_type() == "ScoreBasedActivity"

    def test_persisted_score_fields(self):
        activity = ScoreBasedActivity({})
        assert activity.persisted_score_fields({"achieved_points": 80}) == {
            "points_score": 80
        }

    def test_default_config(self):
        config = ScoreBasedActivity.get_default_config()
        assert config == {"max_points": 100, "base_score": 50}

    def test_calculate_score(self):
        activity = ScoreBasedActivity({"max_points": 100, "base_score": 50})
        score = activity.calculate_score({"achieved_points": 50})
        assert score == pytest.approx(25.0)

    async def test_validate_result_true_when_present(self):
        activity = ScoreBasedActivity({})
        assert await activity.validate_result({"achieved_points": 1}) is True

    async def test_validate_result_false_when_missing(self):
        activity = ScoreBasedActivity({})
        assert await activity.validate_result({}) is False

    def test_get_result_schema(self):
        activity = ScoreBasedActivity({})
        schema = activity.get_result_schema()
        assert schema["required"] == ["achieved_points"]


class _MinimalActivity(BaseActivity):
    """A concrete BaseActivity subclass that doesn't override
    persisted_score_fields, to directly exercise the base's default {}
    return (every real activity type overrides it)."""

    @classmethod
    def get_type(cls) -> str:
        return "MinimalActivity"

    @classmethod
    def get_default_config(cls) -> Dict[str, Any]:
        return {}

    def calculate_score(self, result_data: Dict[str, Any], team_size: int = 1) -> float:
        return 0.0

    async def validate_result(self, result_data: Dict[str, Any], team_id: Optional[int] = None, db_session: Any = None) -> bool:
        return True

    def get_result_schema(self) -> Dict[str, Any]:
        return {}


class TestBaseActivityDefaultPersistedScoreFields:
    def test_default_persisted_score_fields_returns_empty_dict(self):
        activity = _MinimalActivity({})
        assert activity.persisted_score_fields({"anything": 1}) == {}


class TestApplyModifiersPenaltyBranch:
    def test_apply_modifiers_subtracts_multiple_penalties(self):
        activity = ScoreBasedActivity({})
        result = activity.apply_modifiers(
            100.0,
            {"extra_shots": 0, "penalties": {"a": 10, "b": 20}},
        )
        assert result == pytest.approx(70.0)


class TestTeamVsScoreBreakdownOutcomeBranches:
    def test_get_score_breakdown_draw(self):
        activity = TeamVsActivity(config={"draw_points": 15})
        breakdown = activity.get_score_breakdown({"result": "draw", "completed": False})
        assert breakdown["outcome_points"] == pytest.approx(15.0)

    def test_get_score_breakdown_lose(self):
        activity = TeamVsActivity(config={"lose_points": 5})
        breakdown = activity.get_score_breakdown({"result": "lose", "completed": False})
        assert breakdown["outcome_points"] == pytest.approx(5.0)
