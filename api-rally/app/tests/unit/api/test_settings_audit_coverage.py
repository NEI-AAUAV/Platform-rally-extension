"""Every settings field a PUT can write is audited.

The audited list was hand-maintained and had drifted to 34 of the ~50 writable
fields. Everything it had missed was a game mechanic or a point cost —
``hint_penalty``, ``skip_penalty``, ``hints_enabled``, ``skip_enabled``,
``gps_checkin_enabled``, ``reveal_next_checkpoint``, ``route_stages_enabled``,
the leg-time knobs — so the whole of peddy paper's rules could be rewritten
mid-event with no trace, while ``rally_theme`` and ``accent_color`` were
faithfully recorded.
"""

from app.api.api_v1.rally_settings import (
    _SETTINGS_AUDITED_FIELDS,
    _SETTINGS_IDENTITY_FIELDS,
)
from app.schemas.rally_settings import RallySettingsUpdate

# The ones that used to be missing. Named explicitly so the list reads as what
# it is — the mechanics and the costs — rather than as a count.
_PREVIOUSLY_UNAUDITED = {
    "gps_checkin_enabled",
    "reveal_next_checkpoint",
    "hint_penalty",
    "skip_penalty",
    "hints_enabled",
    "skip_enabled",
    "guide_manual_arrival_enabled",
    "reveal_on_arrival",
    "proximity_enabled",
    "compass_enabled",
    "search_radius_m",
    "route_stages_enabled",
    "checkpoint_hours_enabled",
    "leg_time_scoring_enabled",
    "leg_time_target_minutes",
    "leg_time_points_per_minute",
    "leg_time_max_adjustment",
    "button_style",
    "background_style",
    "visual_presets",
}


def test_every_writable_field_is_audited():
    writable = set(RallySettingsUpdate.model_fields) - _SETTINGS_IDENTITY_FIELDS
    assert writable - set(_SETTINGS_AUDITED_FIELDS) == set()


def test_the_mechanics_and_costs_are_covered():
    audited = set(_SETTINGS_AUDITED_FIELDS)
    assert audited >= _PREVIOUSLY_UNAUDITED


def test_identity_fields_are_not_audited_as_changes():
    assert _SETTINGS_IDENTITY_FIELDS.isdisjoint(_SETTINGS_AUDITED_FIELDS)
