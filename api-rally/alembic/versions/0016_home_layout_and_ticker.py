"""add home_layout and ticker_items settings

Adds two JSON columns on rally_settings letting an admin persist a custom
ordered visibility layout for the home page sections and a custom list of
home ticker (marquee) items.

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"
COLUMNS = ("home_layout", "ticker_items")


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
            sa.Column(column, sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            schema=SCHEMA,
        )


def downgrade() -> None:
    existing = _existing_columns()
    for column in COLUMNS:
        if column not in existing:
            continue
        op.drop_column(TABLE, column, schema=SCHEMA)
