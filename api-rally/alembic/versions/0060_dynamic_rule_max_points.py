"""dynamic_rules.max_points: per-rule ceiling on a global bonus counter

`max_bonus_points` (activity) and `default_max_bonus_points` (event) both cap
the *summed* bonus of a checkpoint. Neither can say "this particular bonus is
worth at most 10 points" — so a global bonus rule priced at 3 points could be
entered 20 times and only the sum was ever checked.

This column is that per-rule ceiling, in points. The staff form derives the
maximum count from it (floor(max_points / points)) and blocks the input there;
the server clamps the priced award to it regardless of what arrives.

Nullable rather than defaulted, for the same reason as 0057: NULL is "no
ceiling", 0 is a real ceiling of zero.

Revision ID: 0060
Revises: 0059
Create Date: 2026-09-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0060"
down_revision: str | None = "0059"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME


def upgrade() -> None:
    if table_exists("dynamic_rules", SCHEMA) and not column_exists(
        "dynamic_rules", "max_points", SCHEMA
    ):
        op.add_column(
            "dynamic_rules",
            sa.Column("max_points", sa.Float(), nullable=True),
            schema=SCHEMA,
        )


def downgrade() -> None:
    if table_exists("dynamic_rules", SCHEMA) and column_exists(
        "dynamic_rules", "max_points", SCHEMA
    ):
        op.drop_column("dynamic_rules", "max_points", schema=SCHEMA)
