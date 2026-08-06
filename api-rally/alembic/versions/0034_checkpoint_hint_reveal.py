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


def _table_exists() -> bool:
    bind = op.get_bind()
    return TABLE in sa.inspect(bind).get_table_names(schema=SCHEMA)


def _penalty_column_exists() -> bool:
    bind = op.get_bind()
    columns = sa.inspect(bind).get_columns(SETTINGS_TABLE, schema=SCHEMA)
    return any(c["name"] == PENALTY_COLUMN for c in columns)


def upgrade() -> None:
    if not _table_exists():
        op.create_table(
            TABLE,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "team_id",
                sa.Integer(),
                sa.ForeignKey(f"{SCHEMA}.teams.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "checkpoint_id",
                sa.Integer(),
                sa.ForeignKey(f"{SCHEMA}.checkpoints.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "indication_id",
                sa.Integer(),
                sa.ForeignKey(f"{SCHEMA}.checkpoint_guide_indication.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "revealed_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("cost", sa.Integer(), nullable=False, server_default="0"),
            sa.UniqueConstraint("team_id", "indication_id", name="uq_hint_reveal_team_indication"),
            schema=SCHEMA,
        )

    if not _penalty_column_exists():
        op.add_column(
            SETTINGS_TABLE,
            sa.Column(PENALTY_COLUMN, sa.Integer(), nullable=False, server_default="0"),
            schema=SCHEMA,
        )
        op.execute(
            sa.text(
                f"""
                UPDATE {SCHEMA}.{SETTINGS_TABLE} AS s
                   SET {PENALTY_COLUMN} = -10
                  FROM {SCHEMA}.rally_events AS e
                 WHERE s.event_id = e.id
                   AND e.event_type = 'peddy_paper'
                """
            )
        )


def downgrade() -> None:
    if _penalty_column_exists():
        op.drop_column(SETTINGS_TABLE, PENALTY_COLUMN, schema=SCHEMA)
    if _table_exists():
        op.drop_table(TABLE, schema=SCHEMA)
