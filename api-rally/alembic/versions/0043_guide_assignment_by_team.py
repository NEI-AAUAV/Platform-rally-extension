"""guide assignment: checkpoint -> team

A rally-guide accompanies one team through the whole route rather than
being stationed at a fixed post (that's what rally-staff is for). Swaps
rally_guide_assignment.checkpoint_id for a team_id FK; the checkpoint a
guide may currently act on is now derived from their assigned team's route
progress (see GuideService), not stored.

No data migration: any existing checkpoint_id assignments are dropped along
with the column — there is no meaningful checkpoint->team mapping to carry
over, and re-assigning guides to their team is a one-time manual step.

Revision ID: 0043
Revises: 0042
Create Date: 2026-08-14
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0043"
down_revision: str | None = "0042"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_guide_assignment"


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    if column_exists(TABLE, "checkpoint_id", SCHEMA):
        op.drop_column(TABLE, "checkpoint_id", schema=SCHEMA)
    if not column_exists(TABLE, "team_id", SCHEMA):
        op.add_column(
            TABLE,
            sa.Column(
                "team_id",
                sa.Integer(),
                sa.ForeignKey(f"{SCHEMA}.teams.id"),
                nullable=True,
            ),
            schema=SCHEMA,
        )


def downgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    if column_exists(TABLE, "team_id", SCHEMA):
        op.drop_column(TABLE, "team_id", schema=SCHEMA)
    if not column_exists(TABLE, "checkpoint_id", SCHEMA):
        op.add_column(
            TABLE,
            sa.Column(
                "checkpoint_id",
                sa.Integer(),
                sa.ForeignKey(f"{SCHEMA}.checkpoints.id"),
                nullable=True,
            ),
            schema=SCHEMA,
        )
