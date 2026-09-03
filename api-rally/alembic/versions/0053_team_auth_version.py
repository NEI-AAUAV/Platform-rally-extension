"""Add per-team JWT revocation version.

Revision ID: 0053
Revises: 0052
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0053"
down_revision: str | None = "0052"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME


def upgrade() -> None:
    if table_exists("teams", SCHEMA) and not column_exists("teams", "auth_version", SCHEMA):
        op.add_column(
            "teams",
            sa.Column("auth_version", sa.Integer(), nullable=False, server_default="1"),
            schema=SCHEMA,
        )


def downgrade() -> None:
    if table_exists("teams", SCHEMA) and column_exists("teams", "auth_version", SCHEMA):
        op.drop_column("teams", "auth_version", schema=SCHEMA)
