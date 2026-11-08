"""
Score-based activities for Rally extension
"""

from typing import Any

from app.models.activities.base import BaseActivity

RANK_BY_SCORE_KEY = "rank_by_score"


class ScoreBasedActivity(BaseActivity):
    @classmethod
    def get_type(cls) -> str:
        return "ScoreBasedActivity"

    def calculate_relative_ranking_score(self, all_scores: list[float], team_score: float) -> float:
        """Points by position among all teams: highest score first.

        First place gets max_points, last gets min_points, linear in between.
        Equal scores share a rank, and so the same points.
        """
        if team_score not in all_scores:
            return 0.0

        max_points = float(self.config.get("max_points", 100))
        min_points = float(self.config.get("min_points", 0))

        teams_ahead = sum(1 for score in all_scores if score > team_score)
        if teams_ahead == 0:
            return max_points
        # Checked by value, not by rank: teams tied for last never reach the
        # last rank number, and must still get min_points.
        if team_score == min(all_scores):
            return min_points

        position_ratio = teams_ahead / (len(all_scores) - 1)
        return max_points - (max_points - min_points) * position_ratio

    def persisted_score_fields(self, result_data: dict[str, Any]) -> dict[str, Any]:
        return {"points_score": result_data.get("achieved_points")}

    @classmethod
    def get_default_config(cls) -> dict[str, Any]:
        return {"max_points": 100, "base_score": 50}

    def calculate_score(self, result_data: dict[str, Any], team_size: int = 1) -> float:
        """Calculate score based on achieved points"""
        achieved_points = result_data.get("achieved_points", 0)

        # Calculate percentage of max points achieved
        achieved = float(achieved_points)
        max_pts = float(self.config.get("max_points", 100))
        # config is a free-form dict (never validated against
        # ScoreBasedConfig — see ActivityCreate/ActivityUpdate), so an admin
        # setting max_points to 0 used to 500 every evaluation of this
        # activity. 0 (or negative) points possible means nothing can be
        # achieved, so the percentage is 0 rather than a division.
        percentage = min(achieved / max_pts, 1.0) if max_pts > 0 else 0.0

        # Base score calculation
        base_score = float(self.config.get("base_score", 50))
        return float(base_score * percentage)

    async def validate_result(
        self, result_data: dict[str, Any], team_id: int | None = None, db_session: Any = None
    ) -> bool:
        """Validate score-based result data"""
        required_fields = ["achieved_points"]
        return all(field in result_data for field in required_fields)

    def get_result_schema(self) -> dict[str, Any]:
        """Return schema for score-based results"""
        return {
            "type": "object",
            "properties": {
                "achieved_points": {"type": "integer", "minimum": 0},
                "max_possible_points": {"type": "integer", "minimum": 1},
                "notes": {"type": "string"},
            },
            "required": ["achieved_points"],
        }
