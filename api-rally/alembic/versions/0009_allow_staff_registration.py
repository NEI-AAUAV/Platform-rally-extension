"""allow_staff_registration setting (B4)

Adds allow_staff_registration boolean to rally_settings so admins can
toggle walk-up member registration by staff during an event.

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rally_settings",
        sa.Column("allow_staff_registration", sa.Boolean(), nullable=False, server_default="false"),
        schema=settings.SCHEMA_NAME,
    )


def downgrade() -> None:
    op.drop_column("rally_settings", "allow_staff_registration", schema=settings.SCHEMA_NAME)
