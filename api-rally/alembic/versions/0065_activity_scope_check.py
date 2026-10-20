"""activities: enforce global/checkpoint scope consistency

`is_global` and `checkpoint_id` must agree: a global activity has no
checkpoint, a checkpoint activity has one. The API now rejects incoherent
writes (ActivityCreate/ActivityUpdate validators, crud_activity.update), so
any legacy row in either incoherent state would become impossible to edit —
even an unrelated change such as toggling `is_active` would be refused.

Existing rows are normalised before the constraint is added:

- `is_global AND checkpoint_id IS NOT NULL` -> `checkpoint_id = NULL`. The
  model documents checkpoint_id as ignored for global activities, so this
  does not change behaviour.
- `NOT is_global AND checkpoint_id IS NULL` -> `is_global = TRUE`. With no
  checkpoint the row was already event-wide in practice; marking it global
  keeps its results and scoring instead of guessing a checkpoint.

The downgrade only drops the constraint; the data normalisation is not
reverted (the previous state was invalid).

Revision ID: 0065
Revises: 0064
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import table_exists
from app.core.config import settings

revision: str = "0065"
down_revision: str | None = "0064"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "activities"
CONSTRAINT = "ck_activity_scope"
CONDITION = "(is_global AND checkpoint_id IS NULL) OR (NOT is_global AND checkpoint_id IS NOT NULL)"


def _check_constraint_exists() -> bool:
    # ``migration_utils.constraint_exists`` only sees unique constraints.
    inspector = sa.inspect(op.get_bind())
    return any(
        c["name"] == CONSTRAINT for c in inspector.get_check_constraints(TABLE, schema=SCHEMA)
    )


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    op.execute(
        f'UPDATE "{SCHEMA}".{TABLE} SET checkpoint_id = NULL '
        "WHERE is_global AND checkpoint_id IS NOT NULL"
    )
    op.execute(
        f'UPDATE "{SCHEMA}".{TABLE} SET is_global = TRUE '
        "WHERE NOT is_global AND checkpoint_id IS NULL"
    )
    if not _check_constraint_exists():
        op.create_check_constraint(CONSTRAINT, TABLE, CONDITION, schema=SCHEMA)


def downgrade() -> None:
    if table_exists(TABLE, SCHEMA) and _check_constraint_exists():
        op.drop_constraint(CONSTRAINT, TABLE, schema=SCHEMA, type_="check")
