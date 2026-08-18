"""rally_settings: rules_content + rules_pdf_url

Adds admin-editable overrides for the public /rules page copy
(rules_content, JSON keyed by section id) and an official regulation PDF
URL (rules_pdf_url, written by its own R2 upload endpoint like
banner/logo/favicon).

Revision ID: 0044
Revises: 0043
Create Date: 2026-08-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0044"
down_revision: str | None = "0043"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    if not column_exists(TABLE, "rules_pdf_url", SCHEMA):
        op.add_column(
            TABLE,
            sa.Column("rules_pdf_url", sa.String(500), nullable=False, server_default=""),
            schema=SCHEMA,
        )
    if not column_exists(TABLE, "rules_content", SCHEMA):
        op.add_column(
            TABLE,
            sa.Column("rules_content", sa.JSON(), nullable=False, server_default="{}"),
            schema=SCHEMA,
        )


def downgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    if column_exists(TABLE, "rules_content", SCHEMA):
        op.drop_column(TABLE, "rules_content", schema=SCHEMA)
    if column_exists(TABLE, "rules_pdf_url", SCHEMA):
        op.drop_column(TABLE, "rules_pdf_url", schema=SCHEMA)
