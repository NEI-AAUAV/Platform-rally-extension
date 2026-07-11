"""activity result unique (activity_id, team_id)

Adds a unique constraint on ``activity_results(activity_id, team_id)``: staff
evaluation assumes at most one result row per team per activity, checking
for an existing row before inserting, but two concurrent evaluate requests
can both pass that check and insert duplicates. Deduplicates first, keeping
the most recently updated row (highest id). Constraint-existence guarded —
fresh databases baselined via create_all already have it.

Revision ID: 0023
Revises: 0022
Create Date: 2026-07-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "activity_results"
CONSTRAINT = "uq_activity_results_activity_id_team_id"


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
    # Deduplicate: keep the most recent result (highest id) per (activity, team).
    op.execute(
        sa.text(
            f"DELETE FROM {SCHEMA}.{TABLE} a "
            f"USING {SCHEMA}.{TABLE} b "
            "WHERE a.activity_id = b.activity_id AND a.team_id = b.team_id AND a.id < b.id"
        )
    )
    op.create_unique_constraint(CONSTRAINT, TABLE, ["activity_id", "team_id"], schema=SCHEMA)


def downgrade() -> None:
    if not _constraint_exists():
        return
    op.drop_constraint(CONSTRAINT, TABLE, schema=SCHEMA, type_="unique")
