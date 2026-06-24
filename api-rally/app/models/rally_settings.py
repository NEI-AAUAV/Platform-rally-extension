from sqlalchemy import Column, Integer, Boolean, DateTime, String
from app.models.base import Base

class RallySettings(Base):
    __tablename__ = "rally_settings"  # type: ignore[assignment]

    id = Column(Integer, primary_key=True, default=1) # there's only 1 row
    
    # Team management
    max_teams = Column(Integer, nullable=False, default=16)
    max_members_per_team = Column(Integer, nullable=False, default=10)
    enable_versus = Column(Boolean, nullable=False, default=False)
    
    # Rally timing
    rally_start_time = Column(DateTime(timezone=True), nullable=True)
    rally_end_time = Column(DateTime(timezone=True), nullable=True)
    
    # Scoring system
    penalty_per_puke = Column(Integer, nullable=False, default=-5)
    penalty_per_not_drinking = Column(Integer, nullable=False, default=-2)
    bonus_per_extra_shot = Column(Integer, nullable=False, default=1)
    max_extra_shots_per_member = Column(Integer, nullable=False, default=1)
    
    # Checkpoint behavior
    checkpoint_order_matters = Column(Boolean, nullable=False, default=True)
    
    # Staff and scoring
    enable_staff_scoring = Column(Boolean, nullable=False, default=True)
    
    # Display settings
    show_live_leaderboard = Column(Boolean, nullable=False, default=True)
    show_team_details = Column(Boolean, nullable=False, default=True)
    show_checkpoint_map = Column(Boolean, nullable=False, default=True)
    participant_view_enabled = Column(Boolean, nullable=False, default=False)
    show_route_mode = Column(String(20), nullable=False, default="focused")  # 'focused' or 'complete'
    show_score_mode = Column(String(20), nullable=False, default="hidden")  # 'hidden', 'individual', or 'competitive'
    
    # Rally customization
    # rally_theme is a SKIN PRESET (structure/motif only): 'bloody' | 'nei' | 'default'.
    # Event identity below is DATA, so one build serves every edition.
    rally_theme = Column(String(100), nullable=False, default="Rally Tascas")

    # Universal branding (data, not code)
    event_name = Column(String(120), nullable=False, default="Rally Tascas")
    event_subtitle = Column(String(200), nullable=False, default="")
    accent_color = Column(String(32), nullable=False, default="")  # CSS color, e.g. "#c81d25"
    # Image URLs are written by the R2 upload endpoints, not the settings PUT.
    banner_url = Column(String(500), nullable=False, default="")
    logo_url = Column(String(500), nullable=False, default="")
    favicon_url = Column(String(500), nullable=False, default="")

    # Access control
    public_access_enabled = Column(Boolean, nullable=False, default=False)