"""Unit tests for route planning: readiness of a post."""

from types import SimpleNamespace

from app.services.checkpoint_planning import (
    MISSING_ACTIVITY,
    MISSING_CLUE,
    MISSING_COORDINATES,
    MISSING_NAME,
    MISSING_STAFF,
    missing_fields,
)


def make_checkpoint(**overrides: object) -> SimpleNamespace:
    base = {
        "name": "Cantina de Santiago",
        "clue": "Segue o cheiro da comida",
        "latitude": 40.63,
        "longitude": -8.65,
        "is_placeholder": False,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class TestMissingFields:
    def test_complete_checkpoint_is_ready(self) -> None:
        missing = missing_fields(
            make_checkpoint(),
            has_activity=True,
            has_staff=True,
            requires_coordinates=True,
            requires_clue=True,
        )

        assert missing == []

    def test_reports_every_unfilled_field(self) -> None:
        checkpoint = make_checkpoint(name="  ", clue=None, latitude=None, longitude=None)

        missing = missing_fields(
            checkpoint,
            has_activity=False,
            has_staff=False,
            requires_coordinates=True,
            requires_clue=True,
        )

        assert set(missing) == {
            MISSING_NAME,
            MISSING_CLUE,
            MISSING_COORDINATES,
            MISSING_ACTIVITY,
            MISSING_STAFF,
        }

    def test_placeholder_name_counts_as_missing(self) -> None:
        checkpoint = make_checkpoint(name="Bar 1", is_placeholder=True)

        missing = missing_fields(
            checkpoint,
            has_activity=True,
            has_staff=True,
            requires_coordinates=True,
            requires_clue=True,
        )

        assert missing == [MISSING_NAME]

    def test_coordinates_and_clue_only_required_when_the_event_uses_them(self) -> None:
        checkpoint = make_checkpoint(clue=None, latitude=None, longitude=None)

        missing = missing_fields(
            checkpoint,
            has_activity=True,
            has_staff=True,
            requires_coordinates=False,
            requires_clue=False,
        )

        assert missing == []
