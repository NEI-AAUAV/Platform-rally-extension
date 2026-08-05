"""dynamic_rules and dynamic_awards tables (D4)

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dynamic_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "event_id",
            sa.Integer(),
            sa.ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rule_type", sa.String(64), nullable=False, server_default="bonus"),
        sa.Column("points", sa.Float(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_automatic", sa.Boolean(), nullable=False, server_default="false"),
        schema=settings.SCHEMA_NAME,
    )
    op.create_table(
        "dynamic_awards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "team_id",
            sa.Integer(),
            sa.ForeignKey(f"{settings.SCHEMA_NAME}.teams.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "event_id",
            sa.Integer(),
            sa.ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "rule_id",
            sa.Integer(),
            sa.ForeignKey(f"{settings.SCHEMA_NAME}.dynamic_rules.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("points", sa.Float(), nullable=False),
        sa.Column("reason", sa.String(256), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        schema=settings.SCHEMA_NAME,
    )


def downgrade() -> None:
    op.drop_table("dynamic_awards", schema=settings.SCHEMA_NAME)
    op.drop_table("dynamic_rules", schema=settings.SCHEMA_NAME)
