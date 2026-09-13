"""Add operational event profile without changing existing edition semantics.

Revision ID: 0064
Revises: 0063
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0064"
down_revision: str | None = "0063"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

def upgrade() -> None:
    if table_exists("rally_events", settings.SCHEMA_NAME) and not column_exists("rally_events", "event_profile", settings.SCHEMA_NAME):
        op.add_column("rally_events", sa.Column("event_profile", sa.String(length=32), nullable=False, server_default="custom"), schema=settings.SCHEMA_NAME)

def downgrade() -> None:
    if table_exists("rally_events", settings.SCHEMA_NAME) and column_exists("rally_events", "event_profile", settings.SCHEMA_NAME):
        op.drop_column("rally_events", "event_profile", schema=settings.SCHEMA_NAME)
