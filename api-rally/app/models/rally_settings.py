from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String

from app.core.config import settings as app_settings
from app.models.base import Base


class RallySettings(Base):
    __tablename__ = "rally_settings"

    id = Column(Integer, primary_key=True)
    # One settings row per event. Nullable + unique so the legacy single-row
    # (event_id NULL) settings keep working until migrated to an event.
    event_id = Column(
        Integer,
        ForeignKey(f"{app_settings.SCHEMA_NAME}.rally_events.id"),
        unique=True,
        nullable=True,
        index=True,
    )

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
    show_route_mode = Column(
        String(20), nullable=False, default="focused"
    )  # 'focused' or 'complete'
    show_score_mode = Column(
        String(20), nullable=False, default="hidden"
    )  # 'hidden', 'individual', or 'competitive'

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

    # Visual-identity axes (applied live). Presettable independently of the
    # accent so identities compose (e.g. green accent + blood buttons).
    # 'plain' | 'glow' | 'sharp' | 'shine' | 'halloween' (see BUTTON_STYLES)
    button_style = Column(String(20), nullable=False, default="plain")
    # Background pattern axis: 'plain' | 'dots' | 'grid' | 'glow' | 'stripes' |
    # 'confetti' | 'halloween'. Themed patterns for seasonal editions.
    background_style = Column(String(20), nullable=False, default="plain")
    # Saved named identity presets, each a bundle of the axis values:
    # [{"id","name","accent_color","button_style"}]. Free-form JSON, admin-
    # editable via the settings PUT; normalized on read (see crud_rally_settings).
    visual_presets = Column(JSON, nullable=False, default=list)

    # Access control
    public_access_enabled = Column(Boolean, nullable=False, default=False)

    # Walk-up registration: staff can add team members during event (B4)
    allow_staff_registration = Column(Boolean, nullable=False, default=False)

    # Staff can promote a deferred-judging photo to be the team's official photo
    allow_photo_as_team_photo = Column(Boolean, nullable=False, default=False)

    # GPS geofence self-check-in. Defaults on for peddy paper (where walking a
    # route *is* the game) and off elsewhere, but it is a plain setting: any
    # event whose checkpoints have coordinates and a radius can switch it on.
    gps_checkin_enabled = Column(Boolean, nullable=False, default=False)

    # Redact the next checkpoint's name/description/coordinates until a team
    # checks in. Default on (matches existing rally behaviour); off for peddy
    # paper, where the checkpoint location is itself the puzzle answer.
    reveal_next_checkpoint = Column(Boolean, nullable=False, default=True)

    # Points charged when a team unlocks a guide indication as a hint. Stored
    # negative like every other penalty; 0 means hints are free. Bootstrapped
    # to -10 for peddy paper, where asking for help should cost something.
    hint_penalty = Column(Integer, nullable=False, default=0)

    # Feature switches for the peddy-paper toolkit. Each is separate from its
    # cost: a penalty of 0 means "free", not "off", and an admin mid-event
    # needs to be able to turn a whole mechanic off without losing its price.
    hints_enabled = Column(Boolean, nullable=False, default=True)
    skip_enabled = Column(Boolean, nullable=False, default=True)
    # Lets a guide vouch for an arrival when GPS check-in fails.
    guide_manual_arrival_enabled = Column(Boolean, nullable=False, default=True)
    # Whether arriving reveals a post before its activity has been scored.
    reveal_on_arrival = Column(Boolean, nullable=False, default=True)

    # Points charged when a team gives up on a post it cannot solve. Stored
    # negative; 0 means giving up is free. Steeper than hint_penalty by
    # default, since it forfeits the post's score entirely.
    skip_penalty = Column(Integer, nullable=False, default=0)

    # Guide mode: tourist-guide pages/checkpoint photos, admin-gated feature
    guide_mode_enabled = Column(Boolean, nullable=False, default=False)
    guide_mode_active = Column(Boolean, nullable=False, default=False)

    # Badges / "Conquistas": master kill-switch for the whole achievements
    # feature. When off, participant badge pages/nav are hidden, admin badge
    # writes are blocked, and the worker stops auto-awarding. Default True so
    # existing events keep badges on.
    badges_enabled = Column(Boolean, nullable=False, default=True)

    # Home page layout: ordered list of {"key": str, "visible": bool} covering
    # every home section. Admin-editable via the settings PUT; the app must
    # normalize this on read since it's free-form JSON (see crud_rally_settings).
    home_layout = Column(JSON, nullable=False, default=list)

    # Home page ticker (marquee) items, in display order.
    ticker_items = Column(JSON, nullable=False, default=list)
