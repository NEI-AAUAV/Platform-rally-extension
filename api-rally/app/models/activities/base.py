"""
Base activity class for Rally extension
"""

from abc import ABC, abstractmethod
from typing import Any


class BaseActivity(ABC):
    """Base abstract class for all activities"""

    def __init__(self, config: dict[str, Any]):
        self.config = self.get_default_config()
        self.config.update(config)

    @classmethod
    @abstractmethod
    def get_type(cls) -> str:
        """Return the string identifier for this activity type"""

    @classmethod
    @abstractmethod
    def get_default_config(cls) -> dict[str, Any]:
        """Return the default configuration for this activity type"""

    @abstractmethod
    def calculate_score(self, result_data: dict[str, Any], team_size: int = 1) -> float:
        """Calculate the final score for this activity"""

    @abstractmethod
    async def validate_result(
        self, result_data: dict[str, Any], team_id: int | None = None, db_session: Any = None
    ) -> bool:
        """Validate that the result data is correct for this activity type"""

    @abstractmethod
    def get_result_schema(self) -> dict[str, Any]:
        """Return the expected schema for result data"""

    def persisted_score_fields(self, result_data: dict[str, Any]) -> dict[str, Any]:
        """Map result_data to the ActivityResult score columns this type populates.

        Returns a dict of {column_name: value} (e.g. {"time_score": 42.0}).
        Each activity type owns this mapping so persistence no longer needs an
        if/elif over the activity type. Default: no type-specific column.
        """
        return {}

    def apply_modifiers(
        self, base_score: float, modifiers: dict[str, Any], db_session: Any = None
    ) -> float:
        """Apply scoring modifiers (extra shots, penalties).

        Pure computation — no DB access. The caller (ScoringService) resolves
        the per-shot bonus from RallySettings and passes it via
        modifiers['bonus_per_shot']; we fall back to the config default when it
        is absent. db_session is accepted for backwards compatibility and unused.
        """
        final_score = base_score

        # Apply extra shots bonus (configurable)
        extra_shots = modifiers.get("extra_shots", 0)
        if extra_shots > 0:
            bonus_per_shot = modifiers.get("bonus_per_shot")
            if bonus_per_shot is None:
                from app.core.config import settings

                bonus_per_shot = settings.EXTRA_SHOT_BONUS

            final_score += extra_shots * bonus_per_shot

        # Apply penalties
        penalties = modifiers.get("penalties", {})
        for penalty_type, penalty_value in penalties.items():
            final_score -= penalty_value

        return max(0, final_score)  # Score cannot be negative
