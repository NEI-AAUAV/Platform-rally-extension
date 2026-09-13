from types import SimpleNamespace

from app.domain.event_configuration.policies import Capability, CapabilityPolicy, EventProfile, resolve_policy
from app.domain.event_configuration.validator import ConfigurationIssueSeverity, ConfigurationValidator


def settings(**overrides):
    values = dict(
        participant_view_enabled=True, reveal_next_checkpoint=False, gps_checkin_enabled=True,
        guide_manual_arrival_enabled=False, hints_enabled=True, skip_enabled=True,
        proximity_enabled=False, compass_enabled=False, guide_mode_enabled=False,
        guide_mode_active=False, enable_staff_scoring=True, enable_versus=True,
        route_stages_enabled=False, checkpoint_hours_enabled=True, leg_time_scoring_enabled=False,
        leg_time_points_per_minute=0, badges_enabled=True,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def event(**overrides):
    values = dict(event_type="peddy_paper", event_profile="autonomous", config={})
    values.update(overrides)
    return SimpleNamespace(**values)


def test_autonomous_peddy_policy_requires_player_view_and_redaction():
    policy = resolve_policy("peddy_paper", EventProfile.AUTONOMOUS)
    assert policy.policy_for(Capability.PARTICIPANT_VIEW) is CapabilityPolicy.REQUIRED
    assert policy.policy_for(Capability.CHECKPOINT_REDACTION) is CapabilityPolicy.REQUIRED
    assert policy.policy_for(Capability.GUIDE_ARRIVAL) is CapabilityPolicy.FORBIDDEN


def test_self_checkin_rally_requires_qr_arrival():
    policy = resolve_policy("rally_tascas", EventProfile.SELF_CHECKIN)
    assert policy.policy_for(Capability.QR_ARRIVAL) is CapabilityPolicy.REQUIRED


def test_compass_and_guide_local_invariants_are_errors():
    issues = ConfigurationValidator.local_issues(event_type="generic", profile="custom", settings=settings(compass_enabled=True, guide_mode_active=True))
    assert {issue.code for issue in issues} == {"COMPASS_REQUIRES_PROXIMITY", "GUIDE_ACTIVE_REQUIRES_GUIDE_ENABLED"}


def test_autonomous_peddy_needs_arrival_and_recovery_warning():
    report = ConfigurationValidator.validate(event=event(), settings=settings(gps_checkin_enabled=False, hints_enabled=False, skip_enabled=False), checkpoints=[], route_stages=[], platform_qr_supported=False)
    assert not report.ready
    assert {issue.code for issue in report.issues} >= {"NO_ARRIVAL_METHOD", "NO_CHECKPOINTS", "NO_RECOVERY_PATH"}


def test_gps_preflight_lists_invalid_checkpoint_ids():
    checkpoint = SimpleNamespace(id=9, latitude=None, longitude=None, arrival_radius_m=0)
    report = ConfigurationValidator.validate(event=event(), settings=settings(), checkpoints=[checkpoint], route_stages=[], platform_qr_supported=False)
    issue = next(issue for issue in report.issues if issue.code == "GPS_CHECKPOINT_MISSING_COORDINATES")
    assert issue.entity_ids == [9]
    assert issue.severity is ConfigurationIssueSeverity.ERROR


def test_qr_platform_availability_is_separate_from_event_intent():
    report = ConfigurationValidator.validate(event=event(config={"qr_checkin_enabled": True}), settings=settings(gps_checkin_enabled=False), checkpoints=[], route_stages=[], platform_qr_supported=False)
    assert any(issue.code == "QR_UNAVAILABLE_ON_PLATFORM" for issue in report.issues)
