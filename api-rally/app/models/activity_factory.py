"""
Activity factory for Rally extension
"""

from typing import Any

from app.schemas.activity_types import ActivityType

from app.models.activities import (
    BooleanActivity,
    DeferredJudgedActivity,
    GeneralActivity,
    ScoreBasedActivity,
    TeamVsActivity,
    TimeBasedActivity,
)


class ActivityFactory:
    """Factory for creating activity instances"""

    _activity_classes = {
        ActivityType.TIME_BASED.value: TimeBasedActivity,
        ActivityType.SCORE_BASED.value: ScoreBasedActivity,
        ActivityType.BOOLEAN.value: BooleanActivity,
        ActivityType.TEAM_VS.value: TeamVsActivity,
        ActivityType.GENERAL.value: GeneralActivity,
        ActivityType.DEFERRED_JUDGED.value: DeferredJudgedActivity,
    }

    @classmethod
    def create_activity(
        cls, activity_type: str, config: dict[str, Any]
    ) -> Any:  # Returns BaseActivity subclass
        """Create an activity instance based on type"""
        activity_class = cls._activity_classes.get(activity_type)
        if not activity_class:
            raise ValueError(f"Unknown activity type: {activity_type}")

        return activity_class(config)  # type: ignore[abstract]

    @classmethod
    def get_available_types(cls) -> list[str]:
        """Get list of available activity types"""
        return ActivityType.get_all_values()

    @classmethod
    def get_default_config(cls, activity_type: str) -> dict[str, Any]:
        """Get default configuration for activity type"""
        activity_class = cls._activity_classes.get(activity_type)
        if activity_class:
            return activity_class.get_default_config()
        return {}
