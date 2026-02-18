from app.models.activities.team_vs import TeamVsActivity
import pytest

class TestTeamVsActivity:
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
        assert score == 40.0  # 10 + 30
        
        # Test win + completed
        score = activity.calculate_score({"result": "win", "completed": True})
        assert score == 60.0  # 10 + 20 + 30

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
        assert score == 45.0  # 10 + 20 + 15

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
        assert score == 35.0  # 10 + 20 + 5

    def test_backwards_compatibility(self):
        """Test that old configs (missing base/completion points) still work"""
        activity = TeamVsActivity(config={
            "win_points": 100,
            "draw_points": 50,
            "lose_points": 0
        })
        
        # Should default to 0 for missing fields
        score = activity.calculate_score({"result": "win"})
        assert score == 100.0
        
        score = activity.calculate_score({"result": "win", "completed": True})
        assert score == 100.0  # No completion points configured

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
