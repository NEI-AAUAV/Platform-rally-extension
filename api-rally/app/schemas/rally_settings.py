from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class RallySettingsBase(BaseModel):
    # Team management
    max_teams: int
    max_members_per_team: int
    enable_versus: bool
    
    # Rally timing
    rally_start_time: Optional[datetime] = None
    rally_end_time: Optional[datetime] = None
    
    # Scoring system
    penalty_per_puke: int
    
    # Checkpoint behavior
    checkpoint_order_matters: bool
    
    # Staff and scoring
    enable_staff_scoring: bool
    
    # Display settings
    show_live_leaderboard: bool
    show_team_details: bool
    show_checkpoint_map: bool
    
    # Rally customization
    rally_theme: str
    
    # Access control
    public_access_enabled: bool

class RallySettingsUpdate(RallySettingsBase):
    pass

class RallySettingsResponse(RallySettingsBase):
    model_config = ConfigDict(from_attributes=True)