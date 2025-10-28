"""
Activity type definitions using Enums for better type safety
"""
from enum import Enum


class ActivityType(str, Enum):
    """Enum for activity types with string values for database compatibility"""
    
    TIME_BASED = "TimeBasedActivity"
    SCORE_BASED = "ScoreBasedActivity"
    BOOLEAN = "BooleanActivity"
    TEAM_VS = "TeamVsActivity"
    GENERAL = "GeneralActivity"
    
    @classmethod
    def get_all_values(cls) -> list[str]:
        """Get all enum values as strings"""
        return [activity_type.value for activity_type in cls]
    
    @classmethod
    def is_valid(cls, value: str) -> bool:
        """Check if a string value is a valid activity type"""
        return value in cls.get_all_values()
