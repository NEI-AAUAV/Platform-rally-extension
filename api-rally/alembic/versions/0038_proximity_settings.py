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

from alembic.migration_utils import add_missing_columns, drop_present_columns
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


def upgrade() -> None:
    add_missing_columns(TABLE, COLUMNS, SCHEMA)


def downgrade() -> None:
    drop_present_columns(TABLE, COLUMNS, SCHEMA)
