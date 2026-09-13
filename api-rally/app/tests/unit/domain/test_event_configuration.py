from types import SimpleNamespace

from app.domain.event_configuration.policies import (
    Capability,
    CapabilityPolicy,
    EventProfile,
    initial_settings_defaults,
    profile_is_supported,
    resolve_policy,
)
from app.domain.event_configuration.settings import new_settings_for_profile
from app.domain.event_configuration.validator import (
    ConfigurationIssueSeverity,
    ConfigurationValidator,
)


def settings(**overrides):
    values = dict(
        participant_view_enabled=True,
        reveal_next_checkpoint=False,
        gps_checkin_enabled=True,
        guide_manual_arrival_enabled=False,
        hints_enabled=True,
        skip_enabled=True,
        proximity_enabled=False,
        compass_enabled=False,
        guide_mode_enabled=False,
        guide_mode_active=False,
        enable_staff_scoring=True,
        enable_versus=True,
        route_stages_enabled=False,
        checkpoint_hours_enabled=True,
        leg_time_scoring_enabled=False,
        leg_time_points_per_minute=0,
        badges_enabled=True,
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


def test_profiles_are_family_scoped_but_custom_remains_the_legacy_escape_hatch():
    assert profile_is_supported("peddy_paper", "autonomous")
    assert not profile_is_supported("peddy_paper", "staffed")
    assert profile_is_supported("peddy_paper", "custom")


def test_profile_defaults_are_central_and_do_not_make_guided_peddy_gps_only():
    autonomous = initial_settings_defaults("peddy_paper", "autonomous")
    guided = initial_settings_defaults("peddy_paper", "guided")
    assert autonomous["gps_checkin_enabled"] is True
    assert autonomous["reveal_next_checkpoint"] is False
    assert guided["gps_checkin_enabled"] is False
    assert guided["guide_mode_enabled"] is True
    assert guided["guide_mode_active"] is True
    assert autonomous["guide_manual_arrival_enabled"] is False


def test_real_settings_bootstrap_is_policy_coherent_for_opinionated_profiles():
    for event_type, profile in [
        ("peddy_paper", "autonomous"),
        ("peddy_paper", "guided"),
        ("rally_tascas", "staffed"),
        ("rally_tascas", "self_checkin"),
        ("olympic", "rotation"),
    ]:
        config = {}
        bootstrapped = new_settings_for_profile(
            event_id=1, event_type=event_type, profile=profile, config=config
        )
        issues = ConfigurationValidator.local_issues(
            event_type=event_type, profile=profile, settings=bootstrapped, config=config
        )
        assert not [
            issue
            for issue in issues
            if issue.code in {"REQUIRED_CAPABILITY_DISABLED", "FORBIDDEN_CAPABILITY_ENABLED"}
        ]


def test_olympic_rotation_is_derived_from_schedule_not_event_config():
    report = ConfigurationValidator.validate(
        event=event(
            event_type="olympic",
            event_profile="rotation",
            config={"olympic_rotation": True},
            rotation_schedule=[],
        ),
        settings=settings(),
        checkpoints=[SimpleNamespace(id=1)],
        route_stages=[],
        platform_qr_supported=True,
    )
    assert any(issue.code == "ROTATION_SCHEDULE_MISSING" for issue in report.issues)
    report = ConfigurationValidator.validate(
        event=event(
            event_type="olympic",
            event_profile="rotation",
            rotation_schedule=[[{"team_id": 1, "checkpoint_id": 1}]],
        ),
        settings=settings(),
        checkpoints=[SimpleNamespace(id=1)],
        route_stages=[],
        platform_qr_supported=True,
    )
    assert not any(issue.code == "ROTATION_SCHEDULE_MISSING" for issue in report.issues)


def test_guided_peddy_requires_active_guide_mode():
    issues = ConfigurationValidator.local_issues(
        event_type="peddy_paper",
        profile="guided",
        settings=settings(
            guide_manual_arrival_enabled=True, guide_mode_enabled=True, guide_mode_active=False
        ),
    )
    assert any(
        issue.code == "REQUIRED_CAPABILITY_DISABLED" and issue.fields == ["guide_mode_active"]
        for issue in issues
    )


def test_required_but_disabled_capability_is_not_reported_as_effective():
    report = ConfigurationValidator.validate(
        event=event(event_profile="guided"),
        settings=settings(
            guide_manual_arrival_enabled=False, guide_mode_enabled=True, guide_mode_active=True
        ),
        checkpoints=[SimpleNamespace(id=1, latitude=1.0, longitude=1.0, arrival_radius_m=20)],
        route_stages=[],
        platform_qr_supported=False,
    )
    assert report.capabilities["guide_arrival"]["configured"] is False
    assert report.capabilities["guide_arrival"]["effective"] is False


def test_compass_and_guide_local_invariants_are_errors():
    issues = ConfigurationValidator.local_issues(
        event_type="generic",
        profile="custom",
        settings=settings(compass_enabled=True, guide_mode_active=True),
    )
    assert {issue.code for issue in issues} == {
        "COMPASS_REQUIRES_PROXIMITY",
        "GUIDE_ACTIVE_REQUIRES_GUIDE_ENABLED",
    }


def test_autonomous_peddy_needs_arrival_and_recovery_warning():
    report = ConfigurationValidator.validate(
        event=event(),
        settings=settings(gps_checkin_enabled=False, hints_enabled=False, skip_enabled=False),
        checkpoints=[],
        route_stages=[],
        platform_qr_supported=False,
    )
    assert not report.ready
    assert {issue.code for issue in report.issues} >= {
        "NO_ARRIVAL_METHOD",
        "NO_CHECKPOINTS",
        "NO_RECOVERY_PATH",
    }


def test_gps_preflight_lists_invalid_checkpoint_ids():
    checkpoint = SimpleNamespace(id=9, latitude=None, longitude=None, arrival_radius_m=0)
    report = ConfigurationValidator.validate(
        event=event(),
        settings=settings(),
        checkpoints=[checkpoint],
        route_stages=[],
        platform_qr_supported=False,
    )
    issue = next(
        issue for issue in report.issues if issue.code == "GPS_CHECKPOINT_MISSING_COORDINATES"
    )
    assert issue.entity_ids == [9]
    assert issue.severity is ConfigurationIssueSeverity.ERROR


def test_qr_platform_availability_is_separate_from_event_intent():
    report = ConfigurationValidator.validate(
        event=event(config={"qr_checkin_enabled": True}),
        settings=settings(gps_checkin_enabled=False),
        checkpoints=[],
        route_stages=[],
        platform_qr_supported=False,
    )
    assert any(issue.code == "QR_UNAVAILABLE_ON_PLATFORM" for issue in report.issues)


def test_rotation_schedule_with_stale_team():
    report = ConfigurationValidator.validate(
        event=event(
            event_type="olympic",
            event_profile="rotation",
            rotation_schedule=[[{"team_id": 999, "checkpoint_id": 1}]],
        ),
        settings=settings(),
        checkpoints=[SimpleNamespace(id=1)],
        teams=[SimpleNamespace(id=10)],
        route_stages=[],
        platform_qr_supported=True,
    )
    assert any(issue.code == "ROTATION_SCHEDULE_STALE" for issue in report.issues)


def test_rotation_schedule_with_stale_checkpoint():
    report = ConfigurationValidator.validate(
        event=event(
            event_type="olympic",
            event_profile="rotation",
            rotation_schedule=[[{"team_id": 10, "checkpoint_id": 999}]],
        ),
        settings=settings(),
        checkpoints=[SimpleNamespace(id=1)],
        teams=[SimpleNamespace(id=10)],
        route_stages=[],
        platform_qr_supported=True,
    )
    assert any(issue.code == "ROTATION_SCHEDULE_STALE" for issue in report.issues)


def test_rotation_schedule_invalid_structure():
    report = ConfigurationValidator.validate(
        event=event(
            event_type="olympic",
            event_profile="rotation",
            rotation_schedule="not-a-list",
        ),
        settings=settings(),
        checkpoints=[SimpleNamespace(id=1)],
        teams=[SimpleNamespace(id=10)],
        route_stages=[],
        platform_qr_supported=True,
    )
    assert any(issue.code == "ROTATION_SCHEDULE_INVALID" for issue in report.issues)


def test_reconcile_event_config_preserves_custom_and_clamps_forbidden():
    from app.domain.event_configuration.reconciler import reconcile_event_config

    # Peddy paper forbids drinking scoring
    reconciled = reconcile_event_config(
        event_type="peddy_paper",
        profile="autonomous",
        config={"drinking_scoring": True, "custom_field": 42},
    )
    assert reconciled["drinking_scoring"] is False
    assert reconciled["custom_field"] == 42


def test_reconcile_event_config_enforces_required():
    from app.domain.event_configuration.reconciler import reconcile_event_config

    # Self-checkin rally requires QR checkin
    reconciled = reconcile_event_config(
        event_type="rally_tascas",
        profile="self_checkin",
        config={"qr_checkin_enabled": False},
    )
    assert reconciled["qr_checkin_enabled"] is True


async def test_load_configuration_context_with_preloaded_event_and_settings():
    from unittest.mock import AsyncMock, MagicMock

    from app.domain.event_configuration.context import load_configuration_context

    db = AsyncMock()
    mock_scalars = MagicMock()
    mock_scalars.all.return_value = []
    db.scalars.return_value = mock_scalars

    ev = SimpleNamespace(id=1, event_type="peddy_paper", event_profile="autonomous", config={})
    st = SimpleNamespace(id=1, event_id=1)
    ctx = await load_configuration_context(db, 1, event=ev, settings=st)
    assert ctx.event is ev
    assert ctx.settings is st
    assert ctx.checkpoints == []
    assert ctx.teams == []
