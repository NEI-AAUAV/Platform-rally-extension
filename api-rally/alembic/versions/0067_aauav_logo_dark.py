"""rally_settings.aauav_logo_dark_url: white AAUAv symbol for dark mode

Partner logos carry their dark-mode version inside the ``partner_logos`` JSON
(``dark_url``), so only the AAUAv slot needs a column.

Revision ID: 0067
Revises: 0066
Create Date: 2026-11-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic.migration_utils import add_missing_columns, drop_present_columns, table_exists
from app.core.config import settings

revision: str = "0067"
down_revision: str | None = "0066"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"


def _columns() -> dict[str, sa.Column]:
    return {
        "aauav_logo_dark_url": sa.Column(
            "aauav_logo_dark_url", sa.String(500), nullable=False, server_default=""
        ),
    }


def upgrade() -> None:
    if table_exists(TABLE, SCHEMA):
        add_missing_columns(TABLE, _columns(), SCHEMA)


def downgrade() -> None:
    if table_exists(TABLE, SCHEMA):
        drop_present_columns(TABLE, _columns(), SCHEMA)
