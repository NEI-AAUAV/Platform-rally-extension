from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class RallySettingsBase(BaseModel):
    # Team management
    max_teams: int
    max_members_per_team: int
    enable_versus: bool
    
    # Scoring system
    penalty_per_puke: int
    penalty_per_not_drinking: int
    bonus_per_extra_shot: int
    max_extra_shots_per_member: int
    
    # Checkpoint behavior
    checkpoint_order_matters: bool
    
    # Staff and scoring
    enable_staff_scoring: bool
    
    # Display settings
    show_live_leaderboard: bool
    show_team_details: bool
    show_checkpoint_map: bool
    participant_view_enabled: bool
    show_route_mode: str  # 'focused' or 'complete'
    show_score_mode: str  # 'hidden', 'individual', or 'competitive'
    
    # Rally customization
    rally_theme: str  # skin preset: 'bloody' | 'nei' | 'default'

    # Universal branding (text fields are editable via the settings PUT)
    event_name: str = "Rally Tascas"
    event_subtitle: str = ""
    accent_color: str = ""  # CSS color, e.g. "#c81d25"

    # Access control
    public_access_enabled: bool

    # Walk-up registration gate (B4)
    allow_staff_registration: bool = False

    # Staff can promote a deferred-judging photo to be the team's official photo
    allow_photo_as_team_photo: bool = False

class RallySettingsUpdate(RallySettingsBase):
    ...

class RallySettingsResponse(RallySettingsBase):
    model_config = ConfigDict(from_attributes=True)

    # Rally timing is read-only here: it mirrors the current event's
    # start_time/end_time (single source of truth), set via the events
    # endpoint instead of a settings PUT, so admins configure it once.
    rally_start_time: Optional[datetime] = None
    rally_end_time: Optional[datetime] = None

    # Kind of the current event ('rally_tascas' | 'peddy_paper' | 'generic').
    # Read-only: it lives on the event, not the settings row, and drives
    # terminology/mechanics on the client. Resolved by the route layer.
    event_type: str = "rally_tascas"

    # Image URLs are read-only here: set via the R2 upload endpoints so a
    # plain settings PUT can never clobber them with a stale value.
    banner_url: str = ""
    logo_url: str = ""
    favicon_url: str = ""