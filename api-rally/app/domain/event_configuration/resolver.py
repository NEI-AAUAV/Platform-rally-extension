from dataclasses import dataclass
from typing import Any

from app.domain.event_configuration.policies import (
    DOMAIN_CONFIG_KEYS,
    SETTING_CAPABILITIES,
    Capability,
    CapabilityPolicy,
    resolve_policy,
)


@dataclass(frozen=True)
class EffectiveCapability:
    policy: CapabilityPolicy
    configured: bool
    available: bool
    effective: bool


def is_rotation_schedule_valid_structure(schedule: object) -> bool:
    """Validate rotation schedule structural invariants.

    Schedule must be a non-empty list of rounds, where each round is a non-empty
    list of entries, and each entry is a dict with team_id and checkpoint_id.
    """
    if not isinstance(schedule, list) or not schedule:
        return False
    for round_ in schedule:
        if not isinstance(round_, list) or not round_:
            return False
        for entry in round_:
            if (
                not isinstance(entry, dict)
                or "team_id" not in entry
                or "checkpoint_id" not in entry
            ):
                return False
    return True


def resolve_capabilities(
    *,
    event_type: str,
    profile: str | None,
    settings: object,
    platform_qr_supported: bool,
    event_config: dict[str, Any] | None = None,
    rotation_schedule: object | None = None,
) -> dict[Capability, EffectiveCapability]:
    policy = resolve_policy(event_type, profile)
    config = event_config or {}
    result: dict[Capability, EffectiveCapability] = {}
    for capability, (field, inverted) in SETTING_CAPABILITIES.items():
        if field == "drinking_scoring":
            raw = config.get("drinking_scoring", event_type == "rally_tascas")
        elif field in DOMAIN_CONFIG_KEYS:
            raw = config.get(field, False)
        else:
            raw = getattr(settings, field, False)
        configured = not bool(raw) if inverted else bool(raw)
        available = platform_qr_supported if capability is Capability.QR_ARRIVAL else True
        cap_policy = policy.policy_for(capability)
        # Required is a policy constraint, not a magical runtime override. A
        # half-configured event must report it as ineffective and let
        # preflight explain the required-capability error.
        effective = available and configured and cap_policy is not CapabilityPolicy.FORBIDDEN
        result[capability] = EffectiveCapability(cap_policy, configured, available, effective)
    # Rotation is derived from its actual persisted artefact; never from a
    # duplicate config boolean.
    rotation_configured = is_rotation_schedule_valid_structure(rotation_schedule)
    rotation_policy = policy.policy_for(Capability.OLYMPIC_ROTATION)
    result[Capability.OLYMPIC_ROTATION] = EffectiveCapability(
        rotation_policy,
        rotation_configured,
        True,
        rotation_configured and rotation_policy is not CapabilityPolicy.FORBIDDEN,
    )
    return result
