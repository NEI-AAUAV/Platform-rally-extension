from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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

# The public /rules page is a fully admin-authored list of sections (title +
# icon + body), not a fixed set of built-in topics. Icons are restricted to
# this allowlist (must match the lucide-react components the frontend's
# RULE_SECTION_ICONS map actually renders) so a bad/free-form value can never
# reach the client as an unrenderable icon key.
RULE_SECTION_ICONS = (
    "HelpCircle",
    "MapPin",
    "Trophy",
    "Swords",
    "Award",
    "QrCode",
    "Info",
    "Clock",
    "Shield",
    "Star",
    "Flag",
    "Users",
    "MessageCircle",
    "AlertTriangle",
    "CheckCircle",
    "Ban",
)
DEFAULT_RULE_SECTION_ICON = "HelpCircle"
MAX_RULE_SECTIONS = 30
MAX_RULE_SECTION_TITLE_LENGTH = 80
MAX_RULE_SECTION_BODY_LENGTH = 4000


class RuleSection(BaseModel):
    """One admin-authored section of the public /rules page."""

    id: str
    title: str = ""
    icon: str = DEFAULT_RULE_SECTION_ICON
    body: str = ""


def _field(entry: Any, name: str, default: Any = "") -> Any:
    """Read `name` off a dict-or-object entry, dict form winning."""
    return entry.get(name) if isinstance(entry, dict) else getattr(entry, name, default)


def _normalize_rule_section(entry: Any) -> dict[str, Any] | None:
    """Build one normalized section dict, or None if it has no id."""
    section_id = _field(entry, "id", None)
    if not section_id:
        return None
    icon = _field(entry, "icon")
    return {
        "id": str(section_id),
        "title": str(_field(entry, "title") or "").strip()[:MAX_RULE_SECTION_TITLE_LENGTH],
        "icon": icon if icon in RULE_SECTION_ICONS else DEFAULT_RULE_SECTION_ICON,
        "body": str(_field(entry, "body") or "").strip()[:MAX_RULE_SECTION_BODY_LENGTH],
    }


def normalize_rule_sections(value: list[Any]) -> list[dict[str, Any]]:
    """Trim/cap each section's text, fall back unknown icons, cap the count.

    A section with a blank id is dropped (the frontend always generates one);
    everything else is kept as authored — this list *is* the page, there is
    no separate "unknown key" concept the way home_layout has.
    """
    normalized: list[dict[str, Any]] = []
    for entry in value or []:
        section = _normalize_rule_section(entry)
        if section is None:
            continue
        normalized.append(section)
        if len(normalized) >= MAX_RULE_SECTIONS:
            break
    return normalized


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


# Domain constraints, applied at the schema so an out-of-range value is a 422
# rather than a live event running on it. None of these were bounded before:
# a positive hint_penalty *awarded* points for buying a hint (the cost is
# summed as-is into a DynamicAward), and a show_route_mode typo made
# ``!= "focused"`` true, which is what several reveal checks key off.
NonPositiveInt = Annotated[int, Field(le=0)]
PositiveCount = Annotated[int, Field(ge=1)]
NonNegativeInt = Annotated[int, Field(ge=0)]
RouteMode = Literal["focused", "complete"]
ScoreMode = Literal["hidden", "individual", "competitive"]


class RallySettingsBase(BaseModel):
    # Team management
    max_teams: PositiveCount
    max_members_per_team: PositiveCount
    enable_versus: bool

    # Scoring system. The two per-occurrence penalties are priced through
    # ``abs()`` in resolve_penalty_points, but they are still written and read
    # as costs everywhere a human looks at them, so they are constrained the
    # same way as the rest.
    penalty_per_puke: NonPositiveInt
    penalty_per_not_drinking: NonPositiveInt
    bonus_per_extra_shot: int
    max_extra_shots_per_member: NonNegativeInt

    # Checkpoint behavior
    checkpoint_order_matters: bool

    # Staff and scoring
    enable_staff_scoring: bool

    # Display settings
    show_live_leaderboard: bool
    show_team_details: bool
    show_checkpoint_map: bool
    participant_view_enabled: bool
    show_route_mode: RouteMode
    show_score_mode: ScoreMode

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

    # Points charged for unlocking a hint (negative; 0 disables the cost).
    hint_penalty: NonPositiveInt = 0

    # Points charged for giving up on a post (negative; 0 disables the cost).
    skip_penalty: NonPositiveInt = 0

    # Feature switches, independent of the costs above: 0 points means free,
    # not off.
    hints_enabled: bool = True
    skip_enabled: bool = True
    guide_manual_arrival_enabled: bool = True
    reveal_on_arrival: bool = True
    # Hot/cold distance band on demand, and the (stricter) compass on top.
    proximity_enabled: bool = False
    compass_enabled: bool = False
    # Radius of the on-map search circle for a redacted post; 0 = no circle.
    search_radius_m: NonNegativeInt = 0
    # Route stages: per-block ordering rules (see RouteStage). Off means the
    # whole route is one block governed by checkpoint_order_matters.
    route_stages_enabled: bool = False
    # Enforce each post's own opening window.
    checkpoint_hours_enabled: bool = True

    # Leg-time scoring: reward/penalize how long a team takes between two
    # consecutive checkpoints (see leg_time_service.leg_time_points). Off by
    # default; points_per_minute at 0 also makes it a no-op even when the
    # switch is on, same "toggle separate from cost" convention as the rest
    # of this settings row.
    leg_time_scoring_enabled: bool = False
    leg_time_target_minutes: NonNegativeInt = 10
    leg_time_points_per_minute: int = 0
    # Caps the bonus/penalty magnitude per leg so a team that stops for
    # dinner (or a phone that died) between two posts doesn't blow up the
    # scoreboard either direction.
    leg_time_max_adjustment: NonNegativeInt = 20

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

    # Fully admin-authored sections for the public /rules page (title, icon,
    # body), in display order. Empty means the frontend shows its built-in
    # starter sections instead — see RulesPage.
    rules_sections: list[RuleSection] = []

    @field_validator("rules_sections", mode="before")
    @classmethod
    def _normalize_rules_sections(cls, value: list[Any]) -> list[dict[str, Any]]:
        return normalize_rule_sections(value)

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
    rules_pdf_url: str = ""
