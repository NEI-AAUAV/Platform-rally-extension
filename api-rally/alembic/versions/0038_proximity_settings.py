"""add proximity, compass and search-radius settings

Navigation aids for teams who do not know the city, without handing over the
answer: a coarse distance band on demand, an optional 8-sector bearing once
they are already inside the closest band, and a map circle the post sits inside
but is not the centre of.

All three default to off/0, so no existing event changes behaviour.

Revision ID: 0038
Revises: 0037
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0038"
down_revision: Union[str, None] = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"
COLUMNS: dict[str, sa.Column] = {
    "proximity_enabled": sa.Column(
        "proximity_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
    ),
    "compass_enabled": sa.Column(
        "compass_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
    ),
    "search_radius_m": sa.Column(
        "search_radius_m", sa.Integer(), nullable=False, server_default="0"
    ),
}


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    return {c["name"] for c in sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)}


def upgrade() -> None:
    existing = _existing_columns()
    for name, column in COLUMNS.items():
        if name not in existing:
            op.add_column(TABLE, column, schema=SCHEMA)


def downgrade() -> None:
    existing = _existing_columns()
    for name in COLUMNS:
        if name in existing:
            op.drop_column(TABLE, name, schema=SCHEMA)
