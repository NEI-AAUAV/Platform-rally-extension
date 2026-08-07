"""add hint economy: checkpoint_hint_reveals table + hint_penalty setting

A peddy paper team stuck on a riddle can unlock the guide indications one at a
time, paying points for each. The table records which team unlocked which
indication (unique, so re-tapping is free) and freezes the price paid, so
changing ``hint_penalty`` mid-event never re-prices hints already taken.

``hint_penalty`` is stored negative like every other penalty in the app, and
defaults to 0 (hints free) everywhere except peddy paper, which is backfilled
to -10.

Revision ID: 0034
Revises: 0033
Create Date: 2026-08-06
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
revision: str = "0034"
down_revision: Union[str, None] = "0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "checkpoint_hint_reveals"
SETTINGS_TABLE = "rally_settings"
PENALTY_COLUMN = "hint_penalty"


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        create_penalty_ledger_table(
            TABLE,
            SCHEMA,
            extra_columns=[
                sa.Column(
                    "indication_id",
                    sa.Integer(),
                    sa.ForeignKey(f"{SCHEMA}.checkpoint_guide_indication.id", ondelete="CASCADE"),
                    nullable=False,
                    index=True,
                ),
            ],
            unique=("team_id", "indication_id"),
            unique_name="uq_hint_reveal_team_indication",
            timestamp_column="revealed_at",
        )

    if not column_exists(SETTINGS_TABLE, PENALTY_COLUMN, SCHEMA):
        op.add_column(
            SETTINGS_TABLE,
            sa.Column(PENALTY_COLUMN, sa.Integer(), nullable=False, server_default="0"),
            schema=SCHEMA,
        )
        backfill_peddy_paper_penalty(SCHEMA, SETTINGS_TABLE, PENALTY_COLUMN, -10)


def downgrade() -> None:
    if column_exists(SETTINGS_TABLE, PENALTY_COLUMN, SCHEMA):
        op.drop_column(SETTINGS_TABLE, PENALTY_COLUMN, schema=SCHEMA)
    if table_exists(TABLE, SCHEMA):
        op.drop_table(TABLE, schema=SCHEMA)
