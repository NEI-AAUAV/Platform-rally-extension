"""activity_results.penalty_counts: staff-entered occurrence counts

`penalties` holds the *points* deducted, which is what scoring subtracts. Those
points used to be multiplied by the client, which meant the request body named
its own deduction and, on edit, the count shown to staff was reverse-derived by
dividing the stored points by the *current* price — so any price change
silently rewrote the count ("2 vomits" redisplayed as 4).

This column stores the counts staff actually entered, alongside the priced
points. The server prices them (ScoringService.resolve_penalty_points) and can
re-price them later at current rates (reprice_all_results).

No backfill: existing rows keep their points and get an empty counts map. The
re-price path deliberately leaves a row with no stored counts alone rather than
inventing a count by dividing — dividing at an unknown historical rate is the
exact corruption this column exists to end. Such rows are re-priced the next
time they are edited, when staff enter real counts.

Revision ID: 0047
Revises: 0046
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0047"
down_revision: str | None = "0046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME


def upgrade() -> None:
    if table_exists("activity_results", SCHEMA) and not column_exists(
        "activity_results", "penalty_counts", SCHEMA
    ):
        op.add_column(
            "activity_results",
            sa.Column(
                "penalty_counts",
                sa.JSON(),
                nullable=False,
                server_default="{}",
            ),
            schema=SCHEMA,
        )


def downgrade() -> None:
    if table_exists("activity_results", SCHEMA) and column_exists(
        "activity_results", "penalty_counts", SCHEMA
    ):
        op.drop_column("activity_results", "penalty_counts", schema=SCHEMA)
