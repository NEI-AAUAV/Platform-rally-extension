"""add checkpoint_skips table + skip_penalty setting

A team that cannot solve a riddle had no way out: the hint ladder runs out and
the post stays theirs for the rest of the event. Giving up now costs points and
closes the post as failed, so the route continues.

``skip_penalty`` is stored negative like every other penalty and defaults to 0
(giving up is free) everywhere except peddy paper, which is backfilled to -25 —
steeper than a hint, since it forfeits the post entirely.

Revision ID: 0036
Revises: 0035
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic.migration_utils import (
    backfill_peddy_paper_penalty,
    column_exists,
    create_penalty_ledger_table,
    table_exists,
)
from alembic import op
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0036"
down_revision: Union[str, None] = "0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "checkpoint_skips"
SETTINGS_TABLE = "rally_settings"
PENALTY_COLUMN = "skip_penalty"


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        create_penalty_ledger_table(
            TABLE,
            SCHEMA,
            unique=("team_id", "checkpoint_id"),
            unique_name="uq_skip_team_checkpoint",
            timestamp_column="skipped_at",
        )

    if not column_exists(SETTINGS_TABLE, PENALTY_COLUMN, SCHEMA):
        op.add_column(
            SETTINGS_TABLE,
            sa.Column(PENALTY_COLUMN, sa.Integer(), nullable=False, server_default="0"),
            schema=SCHEMA,
        )
        backfill_peddy_paper_penalty(SCHEMA, SETTINGS_TABLE, PENALTY_COLUMN, -25)


def downgrade() -> None:
    if column_exists(SETTINGS_TABLE, PENALTY_COLUMN, SCHEMA):
        op.drop_column(SETTINGS_TABLE, PENALTY_COLUMN, schema=SCHEMA)
    if table_exists(TABLE, SCHEMA):
        op.drop_table(TABLE, schema=SCHEMA)
