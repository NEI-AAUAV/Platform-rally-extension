"""Single policy reconciliation path used by lifecycle operations."""
from dataclasses import dataclass, field

from .policies import CapabilityPolicy, DOMAIN_CONFIG_KEYS, SETTING_CAPABILITIES, resolve_policy


@dataclass
class ReconciliationResult:
    changes: list[dict] = field(default_factory=list)


def reconcile_policy_state(*, event_type: str, profile: str, settings: object, config: dict | None) -> ReconciliationResult:
    """Force REQUIRED/FORBIDDEN persisted intent and preserve OPTIONAL intent."""
    policy = resolve_policy(event_type, profile)
    config = config if config is not None else {}
    result = ReconciliationResult()
    for capability, (field, inverted) in SETTING_CAPABILITIES.items():
        desired = policy.policy_for(capability)
        if desired is CapabilityPolicy.OPTIONAL:
            continue
        target = desired is CapabilityPolicy.REQUIRED
        if field in DOMAIN_CONFIG_KEYS:
            old = bool(config.get(field, False))
            if old != target:
                config[field] = target
                result.changes.append({"field": field, "from": old, "to": target, "reason": f"{desired.value}_by_policy"})
            continue
        value = not target if inverted else target
        old = getattr(settings, field, False)
        if old != value:
            setattr(settings, field, value)
            result.changes.append({"field": field, "from": old, "to": value, "reason": f"{desired.value}_by_policy"})
    # GUIDE_MODE is a two-field invariant; active is also required/forbidden.
    guide = policy.policy_for(next(c for c in SETTING_CAPABILITIES if c.value == "guide_mode"))
    if guide is not CapabilityPolicy.OPTIONAL:
        target = guide is CapabilityPolicy.REQUIRED
        if getattr(settings, "guide_mode_active", False) != target:
            result.changes.append({"field": "guide_mode_active", "from": getattr(settings, "guide_mode_active", False), "to": target, "reason": f"{guide.value}_by_policy"})
            settings.guide_mode_active = target
    return result
