"""add guide_mode_enabled and guide_mode_active settings

Adds two boolean gates on rally_settings that let an admin decide whether
the guide-mode UI (guide pages, checkpoint photos/nav entries) is available
for an event at all, and whether it's currently switched on.

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"
COLUMNS = ("guide_mode_enabled", "guide_mode_active")


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    columns = sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)
    return {c["name"] for c in columns}


def upgrade() -> None:
    existing = _existing_columns()
    for column in COLUMNS:
        if column in existing:
            continue
        op.add_column(
            TABLE,
            sa.Column(column, sa.Boolean(), nullable=False, server_default=sa.false()),
            schema=SCHEMA,
        )


def downgrade() -> None:
    existing = _existing_columns()
    for column in COLUMNS:
        if column not in existing:
            continue
        op.drop_column(TABLE, column, schema=SCHEMA)
