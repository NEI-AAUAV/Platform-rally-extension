"""Unit tests for ActivityType.is_valid and BadgeDefinition color validation,
neither previously covered."""

import pytest
from pydantic import ValidationError

from app.schemas.activity_types import ActivityType
from app.schemas.badge_definition import BadgeDefinitionCreate


def test_activity_type_is_valid_true_for_known_type():
    assert ActivityType.is_valid("GeneralActivity") is True


def test_activity_type_is_valid_false_for_unknown_type():
    assert ActivityType.is_valid("NotARealType") is False


def test_badge_definition_rejects_non_hex_color():
    with pytest.raises(ValidationError, match="color must be a hex string"):
        BadgeDefinitionCreate(code="test", name="Test", color="not-a-color")


def test_badge_definition_accepts_valid_hex_color():
    defn = BadgeDefinitionCreate(code="test", name="Test", color="#8b5cf6")
    assert defn.color == "#8b5cf6"
