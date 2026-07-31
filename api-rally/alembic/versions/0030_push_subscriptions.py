"""add push_subscriptions table

Web Push (VAPID) subscription store: one row per browser/device install,
tied to the local user. Additive, no data migration.

Revision ID: 0030
Revises: 0029
Create Date: 2026-07-31
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "push_subscriptions"


def _has_table() -> bool:
    bind = op.get_bind()
    return TABLE in sa.inspect(bind).get_table_names(schema=SCHEMA)


def upgrade() -> None:
    if _has_table():
        return
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.String(length=1024), nullable=False),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            [f"{SCHEMA}.users.id"],
            name="fk_push_subscriptions_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_push_subscriptions"),
        sa.UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
        schema=SCHEMA,
    )


def downgrade() -> None:
    if _has_table():
        op.drop_table(TABLE, schema=SCHEMA)
