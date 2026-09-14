"""Single policy reconciliation path used by lifecycle operations."""

from dataclasses import dataclass, field
from typing import Any

from app.domain.event_configuration.policies import (
    DOMAIN_CONFIG_KEYS,
    SETTING_CAPABILITIES,
    Capability,
    CapabilityPolicy,
    EventProfile,
    resolve_policy,
)


@dataclass
class ReconciliationResult:
    changes: list[dict[str, Any]] = field(default_factory=list)


def reconcile_event_config(
    *,
    event_type: str,
    profile: str | EventProfile | None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Ensure config-backed capabilities conform to profile policy while preserving input."""
    policy = resolve_policy(event_type, profile)
    result = dict(config) if config is not None else {}
    for capability in (Capability.QR_ARRIVAL, Capability.DRINKING_SCORING):
        field, _ = SETTING_CAPABILITIES[capability]
        desired = policy.policy_for(capability)
        if desired is CapabilityPolicy.REQUIRED:
            result[field] = True
        elif desired is CapabilityPolicy.FORBIDDEN:
            result[field] = False
        elif (
            desired is CapabilityPolicy.OPTIONAL
            and field == "drinking_scoring"
            and field not in result
        ):
            result[field] = event_type == "rally_tascas"
    return result


def reconcile_policy_state(
    *, event_type: str, profile: str, settings: Any, config: dict[str, Any] | None
) -> ReconciliationResult:
    """Force REQUIRED/FORBIDDEN persisted intent and preserve OPTIONAL intent."""
    policy = resolve_policy(event_type, profile)
    result = ReconciliationResult()
    if config is not None:
        _reconcile_config_capabilities(event_type, profile, config, policy, result)
    _reconcile_setting_capabilities(settings, policy, result)
    _reconcile_guide_mode(settings, policy, result)
    return result


def _reconcile_config_capabilities(
    event_type: str,
    profile: str,
    config: dict[str, Any],
    policy: Any,
    result: ReconciliationResult,
) -> None:
    reconciled = reconcile_event_config(event_type=event_type, profile=profile, config=config)
    for config_field in DOMAIN_CONFIG_KEYS:
        if config_field not in reconciled:
            continue
        old = bool(config.get(config_field, False))
        target = reconciled[config_field]
        if old == target:
            continue
        config[config_field] = target
        cap = next(
            c for c, (candidate, _) in SETTING_CAPABILITIES.items() if candidate == config_field
        )
        desired = policy.policy_for(cap)
        result.changes.append(
            {
                "field": config_field,
                "from": old,
                "to": target,
                "reason": f"{desired.value}_by_policy",
            }
        )


def _reconcile_setting_capabilities(
    settings: Any, policy: Any, result: ReconciliationResult
) -> None:
    for capability, (setting_field, inverted) in SETTING_CAPABILITIES.items():
        if setting_field in DOMAIN_CONFIG_KEYS:
            continue
        desired = policy.policy_for(capability)
        if desired is CapabilityPolicy.OPTIONAL:
            continue
        target = desired is CapabilityPolicy.REQUIRED
        value = not target if inverted else target
        old = getattr(settings, setting_field, False)
        if old != value:
            setattr(settings, setting_field, value)
            result.changes.append(
                {
                    "field": setting_field,
                    "from": old,
                    "to": value,
                    "reason": f"{desired.value}_by_policy",
                }
            )


def _reconcile_guide_mode(settings: Any, policy: Any, result: ReconciliationResult) -> None:
    # GUIDE_MODE is a two-field invariant; active is also required/forbidden.
    guide = policy.policy_for(next(c for c in SETTING_CAPABILITIES if c.value == "guide_mode"))
    if guide is not CapabilityPolicy.OPTIONAL:
        target = guide is CapabilityPolicy.REQUIRED
        if getattr(settings, "guide_mode_active", False) != target:
            result.changes.append(
                {
                    "field": "guide_mode_active",
                    "from": getattr(settings, "guide_mode_active", False),
                    "to": target,
                    "reason": f"{guide.value}_by_policy",
                }
            )
            settings.guide_mode_active = target
