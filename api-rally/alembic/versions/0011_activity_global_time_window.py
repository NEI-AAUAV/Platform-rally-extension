"""Activity.is_global + available_from/until + nullable checkpoint_id (D3)

Global activities apply across all checkpoints; time window gates availability.

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "activities",
        "checkpoint_id",
        existing_type=sa.Integer(),
        nullable=True,
        schema=settings.SCHEMA_NAME,
    )
    op.add_column(
        "activities",
        sa.Column("is_global", sa.Boolean(), nullable=False, server_default="false"),
        schema=settings.SCHEMA_NAME,
    )
    op.add_column(
        "activities",
        sa.Column("available_from", sa.DateTime(timezone=True), nullable=True),
        schema=settings.SCHEMA_NAME,
    )
    op.add_column(
        "activities",
        sa.Column("available_until", sa.DateTime(timezone=True), nullable=True),
        schema=settings.SCHEMA_NAME,
    )


def downgrade() -> None:
    op.drop_column("activities", "available_until", schema=settings.SCHEMA_NAME)
    op.drop_column("activities", "available_from", schema=settings.SCHEMA_NAME)
    op.drop_column("activities", "is_global", schema=settings.SCHEMA_NAME)
    op.alter_column(
        "activities",
        "checkpoint_id",
        existing_type=sa.Integer(),
        nullable=False,
        schema=settings.SCHEMA_NAME,
    )
