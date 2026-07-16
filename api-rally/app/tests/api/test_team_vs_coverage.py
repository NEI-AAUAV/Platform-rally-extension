from unittest.mock import AsyncMock, patch

import pytest

from app.models.activities.team_vs import TeamVsActivity


class TestTeamVsActivity:
    def test_get_type(self):
        assert TeamVsActivity.get_type() == "TeamVsActivity"

    def test_persisted_score_fields(self):
        activity = TeamVsActivity(config={})
        fields = activity.persisted_score_fields({"result": "win"})
        assert fields == {"team_vs_result": "win"}

    def test_get_result_schema(self):
        activity = TeamVsActivity(config={})
        schema = activity.get_result_schema()
        assert schema["required"] == ["result", "opponent_team_id"]
        assert schema["properties"]["result"]["enum"] == ["win", "lose", "draw"]

    def test_default_config(self):
        """Test that default config includes all required fields"""
        config = TeamVsActivity.get_default_config()
        assert config["base_points"] == 0
        assert config["completion_points"] == 0
        assert config["win_points"] == 100
        assert config["draw_points"] == 50
        assert config["lose_points"] == 0

    def test_calculate_score_win(self):
        """Test score calculation for a win"""
        activity = TeamVsActivity(config={
            "base_points": 10,
            "completion_points": 20,
            "win_points": 30,
            "draw_points": 15,
            "lose_points": 5
        })
        
        # Test basic win
        score = activity.calculate_score({"result": "win", "completed": False})
        assert score == pytest.approx(40.0)  # 10 + 30

        # Test win + completed
        score = activity.calculate_score({"result": "win", "completed": True})
        assert score == pytest.approx(60.0)  # 10 + 20 + 30

    def test_calculate_score_draw(self):
        """Test score calculation for a draw"""
        activity = TeamVsActivity(config={
            "base_points": 10,
            "completion_points": 20,
            "win_points": 30,
            "draw_points": 15,
            "lose_points": 5
        })
        
        score = activity.calculate_score({"result": "draw", "completed": True})
        assert score == pytest.approx(45.0)  # 10 + 20 + 15

    def test_calculate_score_lose(self):
        """Test score calculation for a loss"""
        activity = TeamVsActivity(config={
            "base_points": 10,
            "completion_points": 20,
            "win_points": 30,
            "draw_points": 15,
            "lose_points": 5
        })
        
        score = activity.calculate_score({"result": "lose", "completed": True})
        assert score == pytest.approx(35.0)  # 10 + 20 + 5

    def test_backwards_compatibility(self):
        """Test that old configs (missing base/completion points) still work"""
        activity = TeamVsActivity(config={
            "win_points": 100,
            "draw_points": 50,
            "lose_points": 0
        })
        
        # Should default to 0 for missing fields
        score = activity.calculate_score({"result": "win"})
        assert score == pytest.approx(100.0)

        score = activity.calculate_score({"result": "win", "completed": True})
        assert score == pytest.approx(100.0)  # No completion points configured

    def test_get_score_breakdown(self):
        """Test the score breakdown method"""
        activity = TeamVsActivity(config={
            "base_points": 10,
            "completion_points": 20,
            "win_points": 30,
            "draw_points": 15,
            "lose_points": 5
        })
        
        breakdown = activity.get_score_breakdown({"result": "win", "completed": True})
        
        assert breakdown["base_points"] == 10
        assert breakdown["completion_points"] == 20
        assert breakdown["outcome_points"] == 30
        assert breakdown["total"] == 60
        
        # Test with completed=False
        breakdown = activity.get_score_breakdown({"result": "win", "completed": False})
        assert breakdown["completion_points"] == 0
        assert breakdown["total"] == 40

    def test_get_score_breakdown_unknown_result_defaults_outcome_to_zero(self):
        activity = TeamVsActivity(config={"base_points": 10})
        breakdown = activity.get_score_breakdown({"result": "unknown"})
        assert breakdown["outcome_points"] == 0.0


class TestTeamVsValidateResult:
    async def test_validate_result_missing_result_field(self):
        activity = TeamVsActivity(config={})
        assert await activity.validate_result({}) is False

    async def test_validate_result_invalid_result_value(self):
        activity = TeamVsActivity(config={})
        assert await activity.validate_result({"result": "tie"}) is False

    async def test_validate_result_invalid_completed_type(self):
        activity = TeamVsActivity(config={})
        result = await activity.validate_result({"result": "win", "completed": "yes"})
        assert result is False

    async def test_validate_result_without_team_context_is_backwards_compatible(self):
        activity = TeamVsActivity(config={})
        assert await activity.validate_result({"result": "win"}) is True

    async def test_validate_result_requires_opponent_when_team_context_given(self):
        activity = TeamVsActivity(config={})
        result = await activity.validate_result(
            {"result": "win"}, team_id=1, db_session=object()
        )
        assert result is False

    async def test_validate_result_delegates_to_versus_group_check(self):
        activity = TeamVsActivity(config={})
        db_session = object()
        with patch.object(
            activity, "_validate_versus_group", new=AsyncMock(return_value=True)
        ) as mock_validate:
            result = await activity.validate_result(
                {"result": "win", "opponent_team_id": 5},
                team_id=1,
                db_session=db_session,
            )
        assert result is True
        mock_validate.assert_awaited_once_with(1, 5, db_session)


class TestValidateVersusGroup:
    async def test_returns_true_when_opponent_is_none(self):
        activity = TeamVsActivity(config={})
        with patch(
            "app.crud.crud_versus.versus.get_opponent",
            new=AsyncMock(return_value=None),
        ):
            result = await activity._validate_versus_group(1, 2, object())
        assert result is True

    async def test_returns_true_when_opponent_matches(self):
        activity = TeamVsActivity(config={})
        opponent = type("Opp", (), {"id": 2})()
        with patch(
            "app.crud.crud_versus.versus.get_opponent",
            new=AsyncMock(return_value=opponent),
        ):
            result = await activity._validate_versus_group(1, 2, object())
        assert result is True

    async def test_returns_false_when_opponent_mismatch(self):
        activity = TeamVsActivity(config={})
        opponent = type("Opp", (), {"id": 99})()
        with patch(
            "app.crud.crud_versus.versus.get_opponent",
            new=AsyncMock(return_value=opponent),
        ):
            result = await activity._validate_versus_group(1, 2, object())
        assert result is False

    async def test_falls_back_to_true_when_versus_lookup_raises(self):
        activity = TeamVsActivity(config={})
        with patch(
            "app.crud.crud_versus.versus.get_opponent",
            new=AsyncMock(side_effect=RuntimeError("db down")),
        ):
            result = await activity._validate_versus_group(1, 2, object())
        assert result is True


class TestGetOpponentForTeam:
    async def test_returns_opponent_info_when_found(self):
        activity = TeamVsActivity(config={})
        opponent = type(
            "Opp", (), {"id": 2, "name": "Rivals", "versus_group_id": 7}
        )()
        with patch(
            "app.crud.crud_versus.versus.get_opponent",
            new=AsyncMock(return_value=opponent),
        ):
            info = await activity.get_opponent_for_team(1, object())
        assert info == {
            "opponent_team_id": 2,
            "opponent_team_name": "Rivals",
            "versus_group_id": 7,
        }

    async def test_returns_none_when_no_opponent(self):
        activity = TeamVsActivity(config={})
        with patch(
            "app.crud.crud_versus.versus.get_opponent",
            new=AsyncMock(return_value=None),
        ):
            info = await activity.get_opponent_for_team(1, object())
        assert info is None

    async def test_returns_none_when_lookup_raises(self):
        activity = TeamVsActivity(config={})
        with patch(
            "app.crud.crud_versus.versus.get_opponent",
            new=AsyncMock(side_effect=RuntimeError("db down")),
        ):
            info = await activity.get_opponent_for_team(1, object())
        assert info is None


class TestCreateResultForVersusGroup:
    async def test_creates_result_with_opponent_info(self):
        activity = TeamVsActivity(config={})
        with patch.object(
            activity,
            "get_opponent_for_team",
            new=AsyncMock(return_value={"opponent_team_id": 2}),
        ):
            result = await activity.create_result_for_versus_group(
                1, "win", {"notes": "great match"}, object()
            )
        assert result == {
            "result": "win",
            "opponent_team_id": 2,
            "notes": "great match",
        }

    async def test_raises_when_team_not_in_versus_group(self):
        activity = TeamVsActivity(config={})
        with patch.object(
            activity, "get_opponent_for_team", new=AsyncMock(return_value=None)
        ):
            with pytest.raises(ValueError):
                await activity.create_result_for_versus_group(
                    1, "win", {}, object()
                )
