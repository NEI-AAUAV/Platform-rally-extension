"""
Pydantic schemas for activities
"""
from pydantic import BaseModel, Field, validator
from typing import Dict, Any, Optional, List, Union
from datetime import datetime

from app.models.activity_factory import ActivityFactory
from .activity_types import ActivityType


class ActivityBase(BaseModel):
    """Base activity schema"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    activity_type: ActivityType = Field(..., description="Activity type enum")
    checkpoint_id: int = Field(..., gt=0)
    config: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    order: Optional[int] = Field(default=0, ge=0, description="Order of activity within checkpoint (0 = no specific order)")
    
    @validator('activity_type')
    def validate_activity_type(cls, v):
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
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    order: Optional[int] = Field(None, ge=0)


class ActivityResponse(ActivityBase):
    """Schema for activity response"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ActivityResultBase(BaseModel):
    """Base activity result schema"""
    activity_id: int = Field(..., gt=0)
    team_id: int = Field(..., gt=0)
    result_data: Dict[str, Any] = Field(default_factory=dict)
    extra_shots: int = Field(default=0, ge=0)
    penalties: Dict[str, int] = Field(default_factory=dict)


class ActivityResultCreate(ActivityResultBase):
    """Schema for creating an activity result"""
    pass


class ActivityResultUpdate(BaseModel):
    """Schema for updating an activity result"""
    result_data: Optional[Dict[str, Any]] = None
    extra_shots: Optional[int] = Field(None, ge=0)
    penalties: Optional[Dict[str, int]] = None
    is_completed: Optional[bool] = None


class ActivityResultResponse(ActivityResultBase):
    """Schema for activity result response"""
    id: int
    time_score: Optional[float] = None
    points_score: Optional[int] = None
    boolean_score: Optional[bool] = None
    team_vs_result: Optional[str] = None
    final_score: Optional[float] = None
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class RallyEventBase(BaseModel):
    """Base rally event schema"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    is_current: bool = False
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class RallyEventCreate(RallyEventBase):
    """Schema for creating a rally event"""
    pass


class RallyEventUpdate(BaseModel):
    """Schema for updating a rally event"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    is_current: Optional[bool] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class RallyEventResponse(RallyEventBase):
    """Schema for rally event response"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Specific result schemas for different activity types
class TimeBasedResult(BaseModel):
    """Schema for time-based activity results"""
    completion_time_seconds: float = Field(..., ge=0)
    notes: Optional[str] = None


class ScoreBasedResult(BaseModel):
    """Schema for score-based activity results"""
    achieved_points: int = Field(..., ge=0)
    max_possible_points: Optional[int] = Field(None, gt=0)
    notes: Optional[str] = None


class BooleanResult(BaseModel):
    """Schema for boolean activity results"""
    success: bool
    attempts: int = Field(default=1, ge=1)
    notes: Optional[str] = None


class TeamVsResult(BaseModel):
    """Schema for team vs team activity results"""
    result: str = Field(..., pattern="^(win|lose|draw)$")
    opponent_team_id: int = Field(..., gt=0)
    match_duration_seconds: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class GeneralResult(BaseModel):
    """Schema for general activity results"""
    assigned_points: float = Field(..., ge=0, description="Points assigned by staff within configured range")
    reasoning: Optional[str] = Field(None, description="Reason for the assigned score")
    notes: Optional[str] = None


# Activity configuration schemas
class TimeBasedConfig(BaseModel):
    """Configuration schema for time-based activities"""
    max_time_seconds: int = Field(default=300, gt=0)
    time_limit_seconds: int = Field(default=300, gt=0)
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
    activities: List[ActivityResponse]
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
    rankings: List[TeamRanking]


class GlobalRanking(BaseModel):
    """Schema for global team ranking"""
    rankings: List[TeamRanking]
    last_updated: datetime
