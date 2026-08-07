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
                "skipped_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("cost", sa.Integer(), nullable=False, server_default="0"),
            sa.UniqueConstraint("team_id", "checkpoint_id", name="uq_skip_team_checkpoint"),
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
                   SET {PENALTY_COLUMN} = -25
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
