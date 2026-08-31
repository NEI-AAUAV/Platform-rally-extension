"""rally_staff_assignment: one row per (user, checkpoint)

The table had no uniqueness constraint of any kind, so nothing stopped a
second assignment for the same user and post from being written. That made
``get_by_user_id`` — which returns a single row — pick an arbitrary one of
them, and ``create_or_update`` then mutate whichever it happened to get. The
guide equivalent (``rally_guide_assignment``) has carried its constraint
from the start; this brings staff into line.

Duplicate pairs are collapsed before the constraint is added, keeping the
lowest id of each group. They are exact duplicates by definition — the pair
is the whole meaning of the row — so there is no winner to choose.

Revision ID: 0051
Revises: 0050
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from alembic.migration_utils import table_exists
from app.core.config import settings

revision: str = "0051"
down_revision: str | None = "0050"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_staff_assignment"
CONSTRAINT = "uq_staff_assignment_user_checkpoint"


def _constraint_exists() -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE, schema=SCHEMA):
        return True  # nothing to do either way
    return any(
        uc["name"] == CONSTRAINT for uc in inspector.get_unique_constraints(TABLE, schema=SCHEMA)
    )


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA) or _constraint_exists():
        return

    op.execute(
        sa.text(
            f"""
            DELETE FROM {SCHEMA}.{TABLE} a
            USING {SCHEMA}.{TABLE} b
            WHERE a.id > b.id
              AND a.user_id = b.user_id
              AND a.checkpoint_id IS NOT DISTINCT FROM b.checkpoint_id
            """
        )
    )
    op.create_unique_constraint(CONSTRAINT, TABLE, ["user_id", "checkpoint_id"], schema=SCHEMA)


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT, TABLE, schema=SCHEMA, type_="unique")
