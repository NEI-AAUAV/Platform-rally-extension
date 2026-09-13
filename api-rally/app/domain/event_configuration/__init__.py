"""Event configuration domain: policies, effective capabilities and preflight."""

from app.domain.event_configuration.context import (
    ConfigurationContext,
    load_configuration_context,
)
from app.domain.event_configuration.policies import (
    DOMAIN_CONFIG_KEYS,
    Capability,
    CapabilityPolicy,
    EventPolicy,
    EventProfile,
    resolve_policy,
)
from app.domain.event_configuration.reconciler import (
    ReconciliationResult,
    reconcile_event_config,
    reconcile_policy_state,
)
from app.domain.event_configuration.resolver import (
    EffectiveCapability,
    is_rotation_schedule_valid_structure,
    resolve_capabilities,
)
from app.domain.event_configuration.settings import new_settings_for_profile
from app.domain.event_configuration.validator import (
    ConfigurationIssue,
    ConfigurationIssueSeverity,
    ConfigurationReport,
    ConfigurationValidator,
)

__all__ = [
    "Capability",
    "CapabilityPolicy",
    "ConfigurationContext",
    "ConfigurationIssue",
    "ConfigurationIssueSeverity",
    "ConfigurationReport",
    "ConfigurationValidator",
    "DOMAIN_CONFIG_KEYS",
    "EffectiveCapability",
    "EventPolicy",
    "EventProfile",
    "ReconciliationResult",
    "is_rotation_schedule_valid_structure",
    "load_configuration_context",
    "new_settings_for_profile",
    "reconcile_event_config",
    "reconcile_policy_state",
    "resolve_capabilities",
    "resolve_policy",
]
