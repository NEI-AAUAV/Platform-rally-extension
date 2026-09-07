"""activity_results.bonuses / bonus_counts: staff-awarded performance bonus

The mirror of 0047. `penalties` holds the points *deducted* and `penalty_counts`
the occurrence counts staff entered; there was no additive equivalent, so an
activity could only lose points once its base score was set. A boolean
"completed the challenge" activity therefore had no way to express "…and they
did it well", which is what a tie-break needs.

`bonuses` holds the points *added*, keyed the same way, and `bonus_counts` the
counts staff entered. As with penalties, staff submit counts and the server
prices them (ScoringService.resolve_bonus_points), so a request body can never
name its own bonus — the exact hole that ActivityResultStaffUpdate exists to
close for penalties.

No backfill: existing rows get empty maps, which score identically to today.

Revision ID: 0056
Revises: 0055
Create Date: 2026-09-07
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0056"
down_revision: str | None = "0055"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME

_COLUMNS = ("bonuses", "bonus_counts")


def upgrade() -> None:
    if not table_exists("activity_results", SCHEMA):
        return
    for name in _COLUMNS:
        if not column_exists("activity_results", name, SCHEMA):
            op.add_column(
                "activity_results",
                sa.Column(name, sa.JSON(), nullable=False, server_default="{}"),
                schema=SCHEMA,
            )


def downgrade() -> None:
    if not table_exists("activity_results", SCHEMA):
        return
    for name in _COLUMNS:
        if column_exists("activity_results", name, SCHEMA):
            op.drop_column("activity_results", name, schema=SCHEMA)
