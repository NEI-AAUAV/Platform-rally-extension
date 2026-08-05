"""team photo url

Adds ``teams.photo_url`` — the official team photo (R2 public URL) shown on the
team page, leaderboard and team cards. Column-existence guard mirrors 0002/0003:
a fresh database baselined at 0001 runs ``create_all`` over the current models
and may already have the column, whereas a pre-existing database needs it added.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "teams"
COLUMN = "photo_url"


def _column_exists() -> bool:
    bind = op.get_bind()
    cols = [c["name"] for c in sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)]
    return COLUMN in cols


def upgrade() -> None:
    if _column_exists():
        return
    op.add_column(
        TABLE,
        sa.Column(
            COLUMN,
            sa.String(length=500),
            nullable=False,
            server_default="",
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    if not _column_exists():
        return
    op.drop_column(TABLE, COLUMN, schema=SCHEMA)
