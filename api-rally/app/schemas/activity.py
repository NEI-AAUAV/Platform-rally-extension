"""
Pydantic schemas for activities
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Any
from datetime import datetime

from app.models.activity_factory import ActivityFactory
from .activity_types import ActivityType


class ActivityBase(BaseModel):
    """Base activity schema"""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    activity_type: ActivityType = Field(..., description="Activity type enum")
    checkpoint_id: int = Field(..., gt=0)
    config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    
    @field_validator('activity_type')
    @classmethod
    def validate_activity_type(cls, v: Any) -> Any:
        """Validate that activity type is supported by the factory"""
        if isinstance(v, ActivityType):
            # Convert enum to string for factory validation
            activity_type_str = v.value
        else:
            activity_type_str = str(v)
            
        available_types = ActivityFactory.get_available_types()
        if activity_type_str not in available_types:
            raise ValueError(f"Invalid activity type. Available types: {available_types}")
        return v


class ActivityCreate(ActivityBase):
    """Schema for creating an activity"""
    pass


class ActivityUpdate(BaseModel):
    """Schema for updating an activity"""
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    config: dict[str, Any] | None = None
    is_active: bool | None = None


class ActivityResponse(ActivityBase):
    """Schema for activity response"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ActivityResultBase(BaseModel):
    """Base activity result schema"""
    activity_id: int = Field(..., gt=0)
    team_id: int = Field(..., gt=0)
    result_data: dict[str, Any] = Field(default_factory=dict)
    extra_shots: int = Field(default=0, ge=0)
    penalties: dict[str, int] = Field(default_factory=dict)


class ActivityResultEvaluation(BaseModel):
    """Schema for activity result evaluation (without team_id and activity_id)"""
    result_data: dict[str, Any] = Field(default_factory=dict)
    extra_shots: int = Field(default=0, ge=0)
    penalties: dict[str, int] = Field(default_factory=dict)


class ActivityResultCreate(ActivityResultBase):
    """Schema for creating an activity result"""
    pass


class ActivityResultUpdate(BaseModel):
    """Schema for updating an activity result"""
    result_data: dict[str, Any] | None = None
    extra_shots: int | None = Field(None, ge=0)
    penalties: dict[str, int] | None = None
    is_completed: bool | None = None


class ActivityResultResponse(ActivityResultBase):
    """Schema for activity result response"""
    id: int
    time_score: float | None = None
    points_score: int | None = None
    boolean_score: bool | None = None
    team_vs_result: str | None = None
    final_score: float | None = None
    is_completed: bool = False
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class RallyEventBase(BaseModel):
    """Base rally event schema"""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    is_current: bool = False
    start_time: datetime | None = None
    end_time: datetime | None = None


class RallyEventCreate(RallyEventBase):
    """Schema for creating a rally event"""
    pass


class RallyEventUpdate(BaseModel):
    """Schema for updating a rally event"""
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    config: dict[str, Any] | None = None
    is_active: bool | None = None
    is_current: bool | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None


class RallyEventResponse(RallyEventBase):
    """Schema for rally event response"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# Specific result schemas for different activity types
class TimeBasedResult(BaseModel):
    """Schema for time-based activity results"""
    completion_time_seconds: float = Field(..., ge=0)
    notes: str | None = None


class ScoreBasedResult(BaseModel):
    """Schema for score-based activity results"""
    achieved_points: int = Field(..., ge=0)
    max_possible_points: int | None = Field(None, gt=0)
    notes: str | None = None


class BooleanResult(BaseModel):
    """Schema for boolean activity results"""
    success: bool
    attempts: int = Field(default=1, ge=1)
    notes: str | None = None


class TeamVsResult(BaseModel):
    """Schema for team vs team activity results"""
    result: str = Field(..., pattern="^(win|lose|draw)$")
    opponent_team_id: int | None = Field(None, gt=0)  # Optional since validation allows it
    match_duration_seconds: float | None = Field(None, ge=0)
    notes: str | None = None


class GeneralResult(BaseModel):
    """Schema for general activity results"""
    assigned_points: float = Field(..., ge=0, description="Points assigned by staff within configured range")
    reasoning: str | None = Field(None, description="Reason for the assigned score")
    notes: str | None = None


# Activity configuration schemas
class TimeBasedConfig(BaseModel):
    """Configuration schema for time-based activities"""
    max_points: int = Field(default=100, gt=0)
    min_points: int = Field(default=10, ge=0)


class ScoreBasedConfig(BaseModel):
    """Configuration schema for score-based activities"""
    max_points: int = Field(default=100, gt=0)
    base_score: int = Field(default=50, gt=0)


class BooleanConfig(BaseModel):
    """Configuration schema for boolean activities"""
    success_points: int = Field(default=100, gt=0)
    failure_points: int = Field(default=0, ge=0)


class TeamVsConfig(BaseModel):
    """Configuration schema for team vs team activities"""
    win_points: int = Field(default=100, gt=0)
    draw_points: int = Field(default=50, gt=0)
    lose_points: int = Field(default=0, ge=0)


class GeneralConfig(BaseModel):
    """Configuration schema for general activities"""
    min_points: int = Field(default=0, ge=0)
    max_points: int = Field(default=100, gt=0)
    default_points: int = Field(default=50, ge=0)


# Activity list and ranking schemas
class ActivityListResponse(BaseModel):
    """Schema for activity list response"""
    activities: list[ActivityResponse]
    total: int
    page: int
    size: int


class TeamRanking(BaseModel):
    """Schema for team ranking"""
    team_id: int
    team_name: str
    total_score: float
    activities_completed: int
    rank: int


class ActivityRanking(BaseModel):
    """Schema for activity-specific ranking"""
    activity_id: int
    activity_name: str
    rankings: list[TeamRanking]


class GlobalRanking(BaseModel):
    """Schema for global team ranking"""
    rankings: list[TeamRanking]
    last_updated: datetime
