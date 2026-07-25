"""Unit tests for ActivityFactory, no dedicated test file existed before."""

import pytest

from app.models.activities.boolean import BooleanActivity
from app.models.activity_factory import ActivityFactory
from app.schemas.activity_types import ActivityType


def test_create_activity_returns_correct_instance():
    activity = ActivityFactory.create_activity(ActivityType.BOOLEAN.value, {})
    assert isinstance(activity, BooleanActivity)


def test_create_activity_raises_for_unknown_type():
    with pytest.raises(ValueError, match="Unknown activity type"):
        ActivityFactory.create_activity("NotARealType", {})


def test_get_default_config_returns_class_default():
    config = ActivityFactory.get_default_config(ActivityType.BOOLEAN.value)
    assert config == {"success_points": 100, "failure_points": 0}


def test_get_default_config_returns_empty_dict_for_unknown_type():
    assert ActivityFactory.get_default_config("NotARealType") == {}


def test_get_available_types_matches_activity_type_enum():
    assert ActivityFactory.get_available_types() == ActivityType.get_all_values()
