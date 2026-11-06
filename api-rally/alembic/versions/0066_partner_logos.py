"""rally_settings: organising-núcleos logo strip under the home subtitle

Adds the AAUAv symbol slot (left of the strip), the ordered list of partner
núcleo logos, and the admin toggle that shows the strip. Image URLs are only
ever written by the R2 upload endpoints, like the other branding images.

Revision ID: 0066
Revises: 0065
Create Date: 2026-11-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic.migration_utils import add_missing_columns, drop_present_columns, table_exists
from app.core.config import settings

revision: str = "0066"
down_revision: str | None = "0065"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"


def _columns() -> dict[str, sa.Column]:
    return {
        "aauav_logo_url": sa.Column(
            "aauav_logo_url", sa.String(500), nullable=False, server_default=""
        ),
        "partner_logos": sa.Column(
            "partner_logos", sa.JSON(), nullable=False, server_default=sa.text("'[]'")
        ),
        "show_partners": sa.Column(
            "show_partners", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    }


def upgrade() -> None:
    if table_exists(TABLE, SCHEMA):
        add_missing_columns(TABLE, _columns(), SCHEMA)


def downgrade() -> None:
    if table_exists(TABLE, SCHEMA):
        drop_present_columns(TABLE, _columns(), SCHEMA)
