from dataclasses import dataclass
from .policies import Capability, CapabilityPolicy, SETTING_CAPABILITIES, resolve_policy

@dataclass(frozen=True)
class EffectiveCapability:
    policy: CapabilityPolicy
    configured: bool
    available: bool
    effective: bool

def resolve_capabilities(*, event_type: str, profile: str | None, settings: object, platform_qr_supported: bool, event_config: dict | None = None) -> dict[Capability, EffectiveCapability]:
    policy = resolve_policy(event_type, profile)
    config = event_config or {}
    result = {}
    for capability, (field, inverted) in SETTING_CAPABILITIES.items():
        raw = config.get(field, False) if field in {"qr_checkin_enabled", "drinking_scoring", "olympic_rotation"} else getattr(settings, field, False)
        configured = not bool(raw) if inverted else bool(raw)
        available = platform_qr_supported if capability is Capability.QR_ARRIVAL else True
        cap_policy = policy.policy_for(capability)
        effective = available and (cap_policy is CapabilityPolicy.REQUIRED or (cap_policy is CapabilityPolicy.OPTIONAL and configured))
        result[capability] = EffectiveCapability(cap_policy, configured, available, effective)
    return result
