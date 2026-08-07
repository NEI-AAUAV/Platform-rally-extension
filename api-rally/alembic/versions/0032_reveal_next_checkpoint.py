"""add reveal_next_checkpoint setting

Peddy paper events use the checkpoint's own location as the puzzle answer,
so it must not be revealed before the team arrives. This setting gates that
reveal: TRUE (default) keeps existing rally behaviour (full next-checkpoint
detail shown), FALSE redacts name/description/coordinates for the current
checkpoint until the team checks in. Backfilled to FALSE for peddy-paper
events so they get redaction without an explicit admin toggle.

Revision ID: 0032
Revises: 0031
Create Date: 2026-08-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"
COLUMN = "reveal_next_checkpoint"


def _column_exists() -> bool:
    bind = op.get_bind()
    columns = sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)
    return any(c["name"] == COLUMN for c in columns)


def upgrade() -> None:
    if _column_exists():
        return
    op.add_column(
        TABLE,
        sa.Column(COLUMN, sa.Boolean(), nullable=False, server_default=sa.true()),
        schema=SCHEMA,
    )
    op.execute(
        sa.text(
            f"""
            UPDATE {SCHEMA}.{TABLE} AS s
               SET {COLUMN} = false
              FROM {SCHEMA}.rally_events AS e
             WHERE s.event_id = e.id
               AND e.event_type = 'peddy_paper'
            """
        )
    )


def downgrade() -> None:
    if not _column_exists():
        return
    op.drop_column(TABLE, COLUMN, schema=SCHEMA)
