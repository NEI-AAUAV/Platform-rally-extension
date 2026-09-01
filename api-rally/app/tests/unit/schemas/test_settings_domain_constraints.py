"""Domain constraints on the settings and checkpoint schemas.

Every case here was accepted before: the schemas carried no numeric bound and
no enum at all, so a typo in the admin form became the event's live rules.
"""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.checkpoint import CheckPointCreate, CheckPointUpdate
from app.schemas.rally_settings import RallySettingsUpdate


def _settings(**overrides):
    """A valid settings payload with one field overridden."""
    base = {
        "max_teams": 14,
        "max_members_per_team": 10,
        "enable_versus": True,
        "penalty_per_puke": -10,
        "penalty_per_not_drinking": -2,
        "bonus_per_extra_shot": 1,
        "max_extra_shots_per_member": 5,
        "checkpoint_order_matters": True,
        "enable_staff_scoring": True,
        "show_live_leaderboard": True,
        "show_team_details": True,
        "show_checkpoint_map": True,
        "participant_view_enabled": False,
        "show_route_mode": "focused",
        "show_score_mode": "hidden",
        "rally_theme": "bloody",
        "public_access_enabled": True,
    }
    return {**base, **overrides}


class TestPointCosts:
    """A cost is summed into the team's total exactly as given.

    ``hint_penalty`` and ``skip_penalty`` become ``DynamicAward(points=cost)``
    with no sign handling, so a positive value *awards* points for buying a
    hint or giving up — the opposite of what the field is for.
    """

    @pytest.mark.parametrize("field", ["hint_penalty", "skip_penalty"])
    def test_a_positive_cost_is_rejected(self, field):
        with pytest.raises(ValidationError):
            RallySettingsUpdate(**_settings(**{field: 10}))

    @pytest.mark.parametrize("field", ["hint_penalty", "skip_penalty"])
    def test_zero_means_free_and_is_allowed(self, field):
        assert getattr(RallySettingsUpdate(**_settings(**{field: 0})), field) == 0

    @pytest.mark.parametrize("field", ["penalty_per_puke", "penalty_per_not_drinking"])
    def test_per_occurrence_penalties_stay_costs(self, field):
        with pytest.raises(ValidationError):
            RallySettingsUpdate(**_settings(**{field: 5}))


class TestCounts:
    @pytest.mark.parametrize("field", ["max_teams", "max_members_per_team"])
    def test_a_cap_below_one_is_rejected(self, field):
        with pytest.raises(ValidationError):
            RallySettingsUpdate(**_settings(**{field: 0}))

    @pytest.mark.parametrize(
        "field", ["search_radius_m", "leg_time_target_minutes", "leg_time_max_adjustment"]
    )
    def test_a_negative_measure_is_rejected(self, field):
        with pytest.raises(ValidationError):
            RallySettingsUpdate(**_settings(**{field: -1}))


class TestModeEnums:
    """A free-form string here silently changes what the server reveals.

    Several reveal checks are written as ``!= "focused"``, so any value that
    isn't that exact word — including a typo — reads as "complete", and
    ``public_can_view_media`` starts answering True for every post.
    """

    def test_an_unknown_route_mode_is_rejected(self):
        with pytest.raises(ValidationError):
            RallySettingsUpdate(**_settings(show_route_mode="focussed"))

    def test_an_unknown_score_mode_is_rejected(self):
        with pytest.raises(ValidationError):
            RallySettingsUpdate(**_settings(show_score_mode="secret"))

    @pytest.mark.parametrize("mode", ["focused", "complete"])
    def test_the_known_route_modes_are_accepted(self, mode):
        assert RallySettingsUpdate(**_settings(show_route_mode=mode)).show_route_mode == mode


class TestCheckpointWindow:
    """``hours_block_reason`` reads the two ends independently, so an inverted
    window makes a post report "not open yet" and "already closed" at once —
    and reachable at no time at all."""

    def test_a_window_that_closes_before_it_opens_is_rejected(self):
        now = datetime.now(UTC)
        with pytest.raises(ValidationError):
            CheckPointCreate(
                name="CP1",
                order=1,
                available_from=now + timedelta(hours=2),
                available_until=now,
            )

    def test_an_ordered_window_is_accepted(self):
        now = datetime.now(UTC)
        cp = CheckPointCreate(
            name="CP1",
            order=1,
            available_from=now,
            available_until=now + timedelta(hours=2),
        )
        assert cp.available_until > cp.available_from

    def test_one_open_end_is_accepted(self):
        cp = CheckPointCreate(name="CP1", order=1, available_from=datetime.now(UTC))
        assert cp.available_until is None


class TestCheckpointUpdateRejectsOrder:
    """``order`` is unique per event, progress is read by it, and moving it has
    to renumber the rest of the route. Writing it through the plain update did
    none of that — reordering has its own endpoint."""

    def test_order_is_not_an_updatable_field(self):
        assert "order" not in CheckPointUpdate.model_fields

    def test_an_order_in_the_payload_is_ignored_rather_than_written(self):
        update = CheckPointUpdate.model_validate({"name": "New name", "order": 7})
        assert update.model_dump(exclude_unset=True) == {"name": "New name"}
