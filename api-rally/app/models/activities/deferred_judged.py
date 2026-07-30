"""Deferred-judged activity (B3).

Staff captures photo(s) at the moment of performance (best outfit, best object,
etc.). Score is assigned later by a judge via the admin judging panel. The result
starts as ``pending_judgment`` and becomes ``judged`` once the admin sets points.
"""

from typing import Any

from app.models.activities.base import BaseActivity


class DeferredJudgedActivity(BaseActivity):
    @classmethod
    def get_type(cls) -> str:
        return "DeferredJudgedActivity"

    def persisted_score_fields(self, result_data: dict[str, Any]) -> dict[str, Any]:
        return {"points_score": result_data.get("points")}

    @classmethod
    def get_default_config(cls) -> dict[str, Any]:
        return {"max_points": 100, "min_points": 0}

    def calculate_score(self, result_data: dict[str, Any], team_size: int = 1) -> float:
        return float(result_data.get("points", 0))

    async def validate_result(
        self, result_data: dict[str, Any], team_id: int | None = None, db_session: Any = None
    ) -> bool:
        # Capture phase: no points needed; judge phase requires points.
        # We allow either form.
        return True

    def get_result_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "points": {"type": "number", "minimum": 0},
                "notes": {"type": "string"},
            },
        }
