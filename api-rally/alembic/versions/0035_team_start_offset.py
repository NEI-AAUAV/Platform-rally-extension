"""add per-team staggered start offset

Every team walks the same route; spreading the departures stops them all
standing at the same post copying each other's answer. This is the cheap half
of "per-team routes": no change to the positional progress model, just a
per-team shift of the event's start time.

Defaults to 0, so an event that does not use staggered starts behaves exactly
as before.

Revision ID: 0035
Revises: 0034
Create Date: 2026-08-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0035"
down_revision: Union[str, None] = "0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "teams"
COLUMN = "start_offset_minutes"


def _column_exists() -> bool:
    bind = op.get_bind()
    columns = sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)
    return any(c["name"] == COLUMN for c in columns)


def upgrade() -> None:
    if _column_exists():
        return
    op.add_column(
        TABLE,
        sa.Column(COLUMN, sa.Integer(), nullable=False, server_default="0"),
        schema=SCHEMA,
    )


def downgrade() -> None:
    if not _column_exists():
        return
    op.drop_column(TABLE, COLUMN, schema=SCHEMA)
