"""The client must never be able to name its own points.

Staff-facing schemas carry occurrence *counts*; the server prices them. These
tests pin that boundary for the bonus side, which is precisely the operation the
old negative-``penalties`` hole was being used to fabricate — see the docstrings
on ``ActivityResultEvaluation`` / ``ActivityResultStaffUpdate``.
"""

import pytest
from pydantic import ValidationError

from app.schemas.activity import (
    ActivityResultCreate,
    ActivityResultEvaluation,
    ActivityResultStaffUpdate,
    ActivityResultUpdate,
)

STAFF_SCHEMAS = (ActivityResultEvaluation, ActivityResultStaffUpdate)


@pytest.mark.parametrize("schema", STAFF_SCHEMAS)
def test_staff_schemas_have_no_points_fields(schema):
    """Neither side of the ledger is settable by a staff request body."""
    assert "penalties" not in schema.model_fields
    assert "bonuses" not in schema.model_fields


@pytest.mark.parametrize("schema", STAFF_SCHEMAS)
def test_staff_schemas_accept_bonus_counts(schema):
    assert schema(bonus_counts={"perf": 3}).bonus_counts == {"perf": 3}


@pytest.mark.parametrize("schema", STAFF_SCHEMAS)
def test_staff_schemas_ignore_a_smuggled_bonuses_field(schema):
    """An unknown field is dropped rather than reaching the scorer."""
    parsed = schema(bonus_counts={"perf": 1}, bonuses={"perf": 9_999})
    assert not hasattr(parsed, "bonuses")


@pytest.mark.parametrize("schema", (ActivityResultCreate, ActivityResultUpdate))
def test_negative_bonus_points_are_rejected_on_admin_schemas(schema):
    with pytest.raises(ValidationError, match="cannot be negative"):
        schema(activity_id=1, team_id=1, bonuses={"sneaky": -50})


@pytest.mark.parametrize("schema", (ActivityResultCreate, ActivityResultUpdate))
@pytest.mark.parametrize("field", ("penalty_counts", "bonus_counts"))
def test_negative_counts_are_rejected(schema, field):
    with pytest.raises(ValidationError, match="cannot be negative"):
        schema(activity_id=1, team_id=1, **{field: {"perf": -1}})


def test_bonuses_default_to_an_empty_map():
    created = ActivityResultCreate(activity_id=1, team_id=1)
    assert created.bonuses == {}
    assert created.bonus_counts is None
