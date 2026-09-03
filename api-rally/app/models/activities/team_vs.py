"""
Team vs Team activities for Rally extension
"""

from typing import Any

from loguru import logger

from app.models.activities.base import BaseActivity


class TeamVsActivity(BaseActivity):
    @classmethod
    def get_type(cls) -> str:
        return "TeamVsActivity"

    def persisted_score_fields(self, result_data: dict[str, Any]) -> dict[str, Any]:
        return {"team_vs_result": result_data.get("result")}

    @classmethod
    def get_default_config(cls) -> dict[str, Any]:
        return {
            # Tiered scoring — all default to 0 for backwards compatibility
            "base_points": 0,  # Always awarded (participation)
            "completion_points": 0,  # Awarded when team completed the challenge
            # Win/draw/lose outcome points
            "win_points": 100,
            "draw_points": 50,
            "lose_points": 0,
        }

    def calculate_score(self, result_data: dict[str, Any], team_size: int = 1) -> float:
        """Calculate score using tiered formula:
        score = base_points
              + (completion_points if completed)
              + outcome_points (win/draw/lose)
        """
        result = result_data.get("result")  # 'win', 'lose', 'draw'

        # Tier 1: base participation points (always awarded)
        score = float(self.config.get("base_points", 0))

        # Tier 2: completion bonus (opt-in; defaults True for backwards compat)
        completed = result_data.get("completed", True)
        if completed:
            score += float(self.config.get("completion_points", 0))

        # Tier 3: outcome points
        if result == "win":
            score += float(self.config.get("win_points", 100))
        elif result == "draw":
            score += float(self.config.get("draw_points", 50))
        elif result == "lose":
            score += float(self.config.get("lose_points", 0))

        return score

    async def validate_result(
        self, result_data: dict[str, Any], team_id: int | None = None, db_session: Any = None
    ) -> bool:
        """Validate team vs team result data with versus group validation"""
        valid_results = ["win", "lose", "draw"]

        # Basic validation - result is required
        if "result" not in result_data or result_data["result"] not in valid_results:
            return False

        # Validate 'completed' field if present
        if "completed" in result_data and not isinstance(result_data["completed"], bool):
            return False

        # opponent_team_id is required for validation if we have team_id and db_session
        if team_id and db_session:
            if "opponent_team_id" not in result_data or result_data["opponent_team_id"] is None:
                return False
            return await self._validate_versus_group(
                team_id, result_data["opponent_team_id"], db_session
            )

        # If we don't have team_id or db_session, allow validation without opponent check
        # This is for backwards compatibility
        return True

    async def _validate_versus_group(
        self, team_id: int, opponent_team_id: int, db_session: Any
    ) -> bool:
        """Validate that teams are in the same versus group"""
        try:
            # Local import: app.models must not depend on app.crud at module
            # scope (import cycle).
            from app.crud.crud_versus import versus  # noqa: PLC0415

            # Get opponent using versus system
            opponent = await versus.get_opponent(db_session, team_id=team_id)

            # Check if the opponent matches the provided opponent_team_id
            if opponent is None:
                logger.warning(
                    f"Team {team_id} has no opponent in versus system, but "
                    f"opponent_team_id={opponent_team_id} was provided"
                )
                return False

            if opponent.id != opponent_team_id:
                logger.warning(
                    f"Team {team_id} opponent mismatch: expected {opponent.id}, got "
                    f"{opponent_team_id}"
                )
                return False

            return True

        except Exception as e:
            logger.warning(
                f"Versus validation failed for team {team_id} vs {opponent_team_id}: "
                f"{str(e)}, rejecting validation"
            )
            return False

    async def get_opponent_for_team(self, team_id: int, db_session: Any) -> dict[str, Any] | None:
        """Get opponent team information for a given team"""
        try:
            # Local import: app.models must not depend on app.crud at module
            # scope (import cycle).
            from app.crud.crud_versus import versus  # noqa: PLC0415

            opponent = await versus.get_opponent(db_session, team_id=team_id)
            if opponent:
                return {
                    "opponent_team_id": opponent.id,
                    "opponent_team_name": opponent.name,
                    "versus_group_id": opponent.versus_group_id,
                }
            return None

        except Exception:
            return None

    async def create_result_for_versus_group(
        self, team_id: int, result: str, match_data: dict[str, Any], db_session: Any
    ) -> dict[str, Any]:
        """Create result data for a team in a versus group"""
        opponent_info = await self.get_opponent_for_team(team_id, db_session)

        if not opponent_info:
            raise ValueError(f"Team {team_id} is not in a valid versus group")

        return {
            "result": result,
            "opponent_team_id": opponent_info["opponent_team_id"],
            **match_data,
        }

    def get_result_schema(self) -> dict[str, Any]:
        """Return schema for team vs team results"""
        return {
            "type": "object",
            "properties": {
                "result": {"type": "string", "enum": ["win", "lose", "draw"]},
                "completed": {"type": "boolean", "default": True},
                "opponent_team_id": {"type": "integer"},
                "match_duration_seconds": {"type": "number", "minimum": 0},
                "notes": {"type": "string"},
            },
            "required": ["result", "opponent_team_id"],
        }

    def get_score_breakdown(self, result_data: dict[str, Any]) -> dict[str, float]:
        """Return a breakdown of how the score is calculated (useful for UI display)"""
        result = result_data.get("result")
        completed = result_data.get("completed", True)

        base = float(self.config.get("base_points", 0))
        completion = float(self.config.get("completion_points", 0)) if completed else 0.0

        if result == "win":
            outcome = float(self.config.get("win_points", 100))
        elif result == "draw":
            outcome = float(self.config.get("draw_points", 50))
        elif result == "lose":
            outcome = float(self.config.get("lose_points", 0))
        else:
            outcome = 0.0

        return {
            "base_points": base,
            "completion_points": completion,
            "outcome_points": outcome,
            "total": base + completion + outcome,
        }
