"""add allow_photo_as_team_photo setting

Adds a boolean gate on rally_settings that lets an admin decide whether
staff may promote a deferred-judging photo to be the team's official photo.

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"
COLUMN = "allow_photo_as_team_photo"


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


def downgrade() -> None:
    if not _column_exists():
        return
    op.drop_column(TABLE, COLUMN, schema=SCHEMA)
