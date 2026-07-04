"""guide assignment unique user

Adds a unique constraint on ``rally_guide_assignment.user_id``:
``create_or_update`` assumes at most one assignment row per guide, but the
table allowed duplicates (e.g. two concurrent PUTs). Deduplicates first,
keeping the most recent row (highest id). Constraint-existence guarded —
fresh databases baselined via create_all already have it.

Revision ID: 0022
Revises: 0021
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_guide_assignment"
CONSTRAINT = "uq_rally_guide_assignment_user_id"


def _constraint_exists() -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE, schema=SCHEMA):
        return True  # nothing to do either way
    constraints = inspector.get_unique_constraints(TABLE, schema=SCHEMA)
    return any(c["name"] == CONSTRAINT for c in constraints)


def upgrade() -> None:
    if _constraint_exists():
        return
    # Deduplicate: keep the most recent assignment (highest id) per user.
    op.execute(
        sa.text(
            f"DELETE FROM {SCHEMA}.{TABLE} a "
            f"USING {SCHEMA}.{TABLE} b "
            "WHERE a.user_id = b.user_id AND a.id < b.id"
        )
    )
    op.create_unique_constraint(CONSTRAINT, TABLE, ["user_id"], schema=SCHEMA)


def downgrade() -> None:
    if not _constraint_exists():
        return
    op.drop_constraint(CONSTRAINT, TABLE, schema=SCHEMA, type_="unique")
