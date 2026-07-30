"""
Boolean activities for Rally extension
"""

from typing import Any

from app.models.activities.base import BaseActivity


class BooleanActivity(BaseActivity):
    @classmethod
    def get_type(cls) -> str:
        return "BooleanActivity"

    def persisted_score_fields(self, result_data: dict[str, Any]) -> dict[str, Any]:
        return {"boolean_score": result_data.get("success")}

    @classmethod
    def get_default_config(cls) -> dict[str, Any]:
        return {"success_points": 100, "failure_points": 0}

    def calculate_score(self, result_data: dict[str, Any], team_size: int = 1) -> float:
        """Calculate score based on success/failure"""
        success = result_data.get("success", False)

        if success:
            return float(self.config.get("success_points", 100))
        return float(self.config.get("failure_points", 0))

    async def validate_result(
        self, result_data: dict[str, Any], team_id: int | None = None, db_session: Any = None
    ) -> bool:
        """Validate boolean result data"""
        required_fields = ["success"]
        return all(field in result_data for field in required_fields)

    def get_result_schema(self) -> dict[str, Any]:
        """Return schema for boolean results"""
        return {
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "attempts": {"type": "integer", "minimum": 1},
                "notes": {"type": "string"},
            },
            "required": ["success"],
        }
