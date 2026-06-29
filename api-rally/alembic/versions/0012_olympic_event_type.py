"""OLYMPIC event type + rotation_schedule on rally_events (D2)

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rally_events",
        sa.Column("rotation_schedule", sa.JSON(), nullable=True),
        schema=settings.SCHEMA_NAME,
    )


def downgrade() -> None:
    op.drop_column("rally_events", "rotation_schedule", schema=settings.SCHEMA_NAME)
