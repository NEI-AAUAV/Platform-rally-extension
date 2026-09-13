"""Pure, central policy definitions.  Settings remain the persisted source of configuration."""
from dataclasses import dataclass
from enum import Enum


class EventProfile(str, Enum):
    CUSTOM = "custom"  # safe legacy/default escape hatch
    AUTONOMOUS = "autonomous"
    GUIDED = "guided"
    STAFFED = "staffed"
    SELF_CHECKIN = "self_checkin"
    ROTATION = "rotation"


class Capability(str, Enum):
    PARTICIPANT_VIEW = "participant_view"
    CHECKPOINT_REDACTION = "checkpoint_redaction"
    GPS_ARRIVAL = "gps_arrival"
    QR_ARRIVAL = "qr_arrival"
    GUIDE_ARRIVAL = "guide_arrival"
    HINTS = "hints"
    SKIP = "skip"
    PROXIMITY = "proximity"
    COMPASS = "compass"
    STAFF_SCORING = "staff_scoring"
    VERSUS = "versus"
    ROUTE_STAGES = "route_stages"
    CHECKPOINT_HOURS = "checkpoint_hours"
    LEG_TIME_SCORING = "leg_time_scoring"
    GUIDE_MODE = "guide_mode"
    BADGES = "badges"
    DRINKING_SCORING = "drinking_scoring"
    OLYMPIC_ROTATION = "olympic_rotation"


class CapabilityPolicy(str, Enum):
    REQUIRED = "required"
    OPTIONAL = "optional"
    FORBIDDEN = "forbidden"


ALL = frozenset(Capability)


@dataclass(frozen=True)
class EventPolicy:
    event_type: str
    profile: EventProfile
    capabilities: dict[Capability, CapabilityPolicy]
    description: str

    def policy_for(self, capability: Capability) -> CapabilityPolicy:
        return self.capabilities.get(capability, CapabilityPolicy.OPTIONAL)


def _policy(event_type: str, profile: EventProfile, *, required: set[Capability] = set(), forbidden: set[Capability] = set(), description: str) -> EventPolicy:
    capabilities = {capability: CapabilityPolicy.OPTIONAL for capability in ALL}
    for capability in required:
        capabilities[capability] = CapabilityPolicy.REQUIRED
    for capability in forbidden:
        capabilities[capability] = CapabilityPolicy.FORBIDDEN
    return EventPolicy(event_type, profile, capabilities, description)


_PEDDY_FORBIDDEN = {Capability.DRINKING_SCORING, Capability.OLYMPIC_ROTATION}
POLICIES: dict[tuple[str, EventProfile], EventPolicy] = {
    ("peddy_paper", EventProfile.AUTONOMOUS): _policy("peddy_paper", EventProfile.AUTONOMOUS, required={Capability.PARTICIPANT_VIEW, Capability.CHECKPOINT_REDACTION}, forbidden=_PEDDY_FORBIDDEN | {Capability.GUIDE_ARRIVAL}, description="As equipas descobrem e validam o percurso autonomamente."),
    ("peddy_paper", EventProfile.GUIDED): _policy("peddy_paper", EventProfile.GUIDED, required={Capability.PARTICIPANT_VIEW, Capability.CHECKPOINT_REDACTION, Capability.GUIDE_ARRIVAL, Capability.GUIDE_MODE}, forbidden=_PEDDY_FORBIDDEN, description="As equipas seguem o percurso com apoio de guias."),
    ("rally_tascas", EventProfile.STAFFED): _policy("rally_tascas", EventProfile.STAFFED, required={Capability.STAFF_SCORING}, forbidden={Capability.OLYMPIC_ROTATION}, description="Rally com operações e avaliação por staff."),
    ("rally_tascas", EventProfile.SELF_CHECKIN): _policy("rally_tascas", EventProfile.SELF_CHECKIN, required={Capability.QR_ARRIVAL}, forbidden={Capability.OLYMPIC_ROTATION}, description="Rally com check-in autónomo por QR onde a plataforma o suporta."),
    ("olympic", EventProfile.ROTATION): _policy("olympic", EventProfile.ROTATION, required={Capability.OLYMPIC_ROTATION}, forbidden={Capability.CHECKPOINT_REDACTION, Capability.PROXIMITY, Capability.COMPASS, Capability.HINTS, Capability.SKIP, Capability.DRINKING_SCORING}, description="Estações rodativas com resultados por prova."),
}

# ``custom`` is deliberately accepted for every family: it is the lossless
# compatibility profile for existing editions and the explicit escape hatch
# for organisers who need a workflow outside the opinionated profiles.
AVAILABLE_PROFILES: dict[str, frozenset[EventProfile]] = {
    "peddy_paper": frozenset({EventProfile.CUSTOM, EventProfile.AUTONOMOUS, EventProfile.GUIDED}),
    "rally_tascas": frozenset({EventProfile.CUSTOM, EventProfile.STAFFED, EventProfile.SELF_CHECKIN}),
    "olympic": frozenset({EventProfile.CUSTOM, EventProfile.ROTATION}),
    "generic": frozenset({EventProfile.CUSTOM}),
}


def default_profile(event_type: str) -> EventProfile:
    return {"peddy_paper": EventProfile.AUTONOMOUS, "rally_tascas": EventProfile.STAFFED, "olympic": EventProfile.ROTATION}.get(event_type, EventProfile.CUSTOM)


def profile_is_supported(event_type: str, profile: str | EventProfile) -> bool:
    """Whether a profile is meaningful for an event family.

    The resolver has a safe custom fallback for historic rows, while writes
    must not turn a cross-family profile into an accidental generic policy.
    """
    try:
        normalized = EventProfile(profile)
    except ValueError:
        return False
    return normalized in AVAILABLE_PROFILES.get(event_type, frozenset({EventProfile.CUSTOM}))


def initial_settings_defaults(event_type: str, profile: str | EventProfile | None) -> dict[str, object]:
    """The small set of *profile* defaults, separate from model defaults.

    Persisted column defaults still belong to ``RallySettings``.  This only
    answers the domain question "what should a newly-created format start
    with?" and is shared by every settings bootstrap.
    """
    try:
        normalized = EventProfile(profile) if profile else default_profile(event_type)
    except ValueError:
        # Historic rows must stay readable; the preflight/API can surface the
        # unsupported value without making settings bootstrap crash.
        normalized = EventProfile.CUSTOM
    peddy = event_type == "peddy_paper"
    guided = peddy and normalized is EventProfile.GUIDED
    return {
        "gps_checkin_enabled": peddy and normalized is EventProfile.AUTONOMOUS,
        "reveal_next_checkpoint": not peddy,
        "hint_penalty": -10 if peddy else 0,
        "skip_penalty": -25 if peddy else 0,
        "participant_view_enabled": peddy,
        "guide_mode_enabled": guided,
        "guide_mode_active": guided,
    }


def resolve_policy(event_type: str, profile: str | EventProfile | None) -> EventPolicy:
    try:
        normalized = EventProfile(profile) if profile else default_profile(event_type)
    except ValueError:
        normalized = EventProfile.CUSTOM
    return POLICIES.get((event_type, normalized), _policy(event_type, EventProfile.CUSTOM, description="Configuração livre, sujeita aos invariantes universais."))


# The explicit mapping is intentionally here, next to policy rather than dispersed through APIs.
SETTING_CAPABILITIES: dict[Capability, tuple[str, bool]] = {
    Capability.PARTICIPANT_VIEW: ("participant_view_enabled", False),
    Capability.CHECKPOINT_REDACTION: ("reveal_next_checkpoint", True),
    Capability.GPS_ARRIVAL: ("gps_checkin_enabled", False),
    Capability.QR_ARRIVAL: ("qr_checkin_enabled", False), # event intent lives in config until a dedicated column exists
    Capability.GUIDE_ARRIVAL: ("guide_manual_arrival_enabled", False),
    Capability.HINTS: ("hints_enabled", False), Capability.SKIP: ("skip_enabled", False),
    Capability.PROXIMITY: ("proximity_enabled", False), Capability.COMPASS: ("compass_enabled", False),
    Capability.STAFF_SCORING: ("enable_staff_scoring", False), Capability.VERSUS: ("enable_versus", False),
    Capability.ROUTE_STAGES: ("route_stages_enabled", False), Capability.CHECKPOINT_HOURS: ("checkpoint_hours_enabled", False),
    Capability.LEG_TIME_SCORING: ("leg_time_scoring_enabled", False), Capability.GUIDE_MODE: ("guide_mode_enabled", False),
    Capability.BADGES: ("badges_enabled", False), Capability.DRINKING_SCORING: ("drinking_scoring", False),
    Capability.OLYMPIC_ROTATION: ("olympic_rotation", False),
}
