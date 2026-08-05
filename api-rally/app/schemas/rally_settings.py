from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator

# Canonical, ordered set of home page section keys. Any home_layout entry
# with an unknown key is dropped; any missing key is appended (visible by
# default) so the client always receives every section, in some order.
HOME_SECTION_KEYS = (
    "home_hero",
    "rally_marquee",
    "event_stats",
    "live_top5",
    "how_it_works",
    "postos_preview",
    "home_bottom_banner",
)

DEFAULT_HOME_LAYOUT = [{"key": key, "visible": True} for key in HOME_SECTION_KEYS]

DEFAULT_TICKER_ITEMS = [
    "RALLY TASCAS 2026",
    "NEI",
    "EQUIPAS",
    "POSTOS",
    "PONTUAÇÃO",
]

MAX_TICKER_ITEMS = 20
MAX_TICKER_ITEM_LENGTH = 40


class HomeSection(BaseModel):
    key: str
    visible: bool = True


# Visual-identity axes. Each axis is applied live and can be mixed freely; a
# saved VisualPreset bundles a chosen value per axis under a name.
BUTTON_STYLES = ("plain", "glow", "sharp", "shine", "halloween")
BACKGROUND_STYLES = ("plain", "dots", "grid", "glow", "stripes", "confetti", "halloween")
MAX_VISUAL_PRESETS = 24


class VisualPreset(BaseModel):
    id: str
    name: str
    accent_color: str = ""
    button_style: str = "plain"
    background_style: str = "plain"


def normalize_home_layout(value: list[Any]) -> list[dict[str, Any]]:
    """Drop unknown keys, dedupe, and append any missing known section keys.

    Existing order/visibility for known keys is preserved; this only fills
    gaps so a partial or legacy (empty) layout still yields every section.
    """
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for entry in value or []:
        key = entry.get("key") if isinstance(entry, dict) else getattr(entry, "key", None)
        visible = (
            entry.get("visible") if isinstance(entry, dict) else getattr(entry, "visible", True)
        )
        if key not in HOME_SECTION_KEYS or key in seen:
            continue
        seen.add(key)
        normalized.append({"key": key, "visible": bool(visible)})

    for key in HOME_SECTION_KEYS:
        if key not in seen:
            normalized.append({"key": key, "visible": True})

    return normalized


def normalize_ticker_items(value: list[Any]) -> list[str]:
    """Trim, drop blanks, cap item length and total count."""
    items: list[str] = []
    for item in value or []:
        text = str(item).strip()[:MAX_TICKER_ITEM_LENGTH]
        if not text:
            continue
        items.append(text)
        if len(items) >= MAX_TICKER_ITEMS:
            break
    return items


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

    # Visual-identity axes (applied live), presettable independently of accent.
    button_style: str = "plain"  # see BUTTON_STYLES
    background_style: str = "plain"  # pattern axis; see BACKGROUND_STYLES
    # Saved named identity presets (bundles of the axis values).
    visual_presets: list[VisualPreset] = []

    # Access control
    public_access_enabled: bool

    # Walk-up registration gate (B4)
    allow_staff_registration: bool = False

    # Staff can promote a deferred-judging photo to be the team's official photo
    allow_photo_as_team_photo: bool = False

    # GPS geofence self-check-in (bootstrapped on for peddy paper, see
    # crud_rally_settings.get_or_create); admin-togglable for any event.
    gps_checkin_enabled: bool = False

    # Redact next checkpoint's name/description/coordinates until check-in
    # (bootstrapped off for peddy paper, see crud_rally_settings.get_or_create).
    reveal_next_checkpoint: bool = True

    # Guide mode: tourist-guide pages/checkpoint photos, only shown when the
    # admin has both enabled the feature and switched it on for the event
    guide_mode_enabled: bool = False
    guide_mode_active: bool = False

    # Badges / "Conquistas" master kill-switch. Default True so existing
    # events keep the achievements feature on.
    badges_enabled: bool = True

    # Home page layout: ordered section visibility, admin-editable
    home_layout: list[HomeSection] = [HomeSection(key=key) for key in HOME_SECTION_KEYS]

    # Home page ticker items, in display order
    ticker_items: list[str] = list(DEFAULT_TICKER_ITEMS)

    @field_validator("home_layout", mode="before")
    @classmethod
    def _normalize_home_layout(cls, value: list[Any]) -> list[dict[str, Any]]:
        return normalize_home_layout(value)

    @field_validator("ticker_items", mode="before")
    @classmethod
    def _normalize_ticker_items(cls, value: list[Any]) -> list[str]:
        return normalize_ticker_items(value)

    @field_validator("button_style", mode="before")
    @classmethod
    def _normalize_button_style(cls, value: Any) -> str:
        return value if value in BUTTON_STYLES else "plain"

    @field_validator("background_style", mode="before")
    @classmethod
    def _normalize_background_style(cls, value: Any) -> str:
        return value if value in BACKGROUND_STYLES else "plain"

    @field_validator("visual_presets", mode="before")
    @classmethod
    def _cap_visual_presets(cls, value: Any) -> Any:
        # Free-form JSON on read; only guard the length here (item shape is
        # validated by the VisualPreset model).
        if isinstance(value, list):
            return value[:MAX_VISUAL_PRESETS]
        return []


class RallySettingsUpdate(RallySettingsBase): ...


class RallySettingsResponse(RallySettingsBase):
    model_config = ConfigDict(from_attributes=True)

    # Rally timing is read-only here: it mirrors the current event's
    # start_time/end_time (single source of truth), set via the events
    # endpoint instead of a settings PUT, so admins configure it once.
    rally_start_time: datetime | None = None
    rally_end_time: datetime | None = None

    # Kind of the current event ('rally_tascas' | 'peddy_paper' | 'generic').
    # Read-only: it lives on the event, not the settings row, and drives
    # terminology/mechanics on the client. Resolved by the route layer.
    event_type: str = "rally_tascas"

    # Image URLs are read-only here: set via the R2 upload endpoints so a
    # plain settings PUT can never clobber them with a stale value.
    banner_url: str = ""
    logo_url: str = ""
    favicon_url: str = ""
