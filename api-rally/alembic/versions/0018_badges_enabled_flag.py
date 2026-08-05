"""add badges_enabled kill-switch to rally_settings

Adds a single boolean gate on rally_settings that lets an admin turn the whole
badges / "Conquistas" feature off for an event. Defaults to true so existing
events keep the achievements feature on after upgrade.

Revision ID: 0018
Revises: 0017
Create Date: 2026-07-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"
COLUMN = "badges_enabled"


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    columns = sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)
    return {c["name"] for c in columns}


def upgrade() -> None:
    if COLUMN in _existing_columns():
        return
    op.add_column(
        TABLE,
        sa.Column(COLUMN, sa.Boolean(), nullable=False, server_default=sa.true()),
        schema=SCHEMA,
    )


def downgrade() -> None:
    if COLUMN not in _existing_columns():
        return
    op.drop_column(TABLE, COLUMN, schema=SCHEMA)
