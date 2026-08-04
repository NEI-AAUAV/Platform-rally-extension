"""add gps_checkin_enabled setting

Replaces the hardcoded "GPS check-in only for peddy_paper" gate with a plain
per-event setting. Backfilled to TRUE for peddy-paper events and FALSE for
every other format, so existing deployments keep exactly the behaviour the
hardcoded check gave them.

Revision ID: 0031
Revises: 0030
Create Date: 2026-08-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0031"
down_revision: Union[str, None] = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"
COLUMN = "gps_checkin_enabled"


def _column_exists() -> bool:
    bind = op.get_bind()
    columns = sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)
    return any(c["name"] == COLUMN for c in columns)


def upgrade() -> None:
    if _column_exists():
        return
    op.add_column(
        TABLE,
        sa.Column(COLUMN, sa.Boolean(), nullable=False, server_default=sa.false()),
        schema=SCHEMA,
    )
    # Preserve current behaviour: peddy-paper events had GPS check-in, nothing
    # else did. Legacy unscoped settings rows (event_id NULL) have no event to
    # read a type from and stay FALSE, matching the old endpoint's rejection of
    # a request with no resolvable peddy-paper event.
    op.execute(
        sa.text(
            f"""
            UPDATE {SCHEMA}.{TABLE} AS s
               SET {COLUMN} = true
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
