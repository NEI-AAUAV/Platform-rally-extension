"""checkpoint media gallery

Adds ``checkpoint_media`` table with photo/fun_fact rows per checkpoint.
Uses a table-existence guard — fresh databases baselined at 0001 may already
have the table created via create_all, so we skip if it exists.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "checkpoint_media"


def _table_exists() -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(TABLE, schema=SCHEMA)


def upgrade() -> None:
    if _table_exists():
        return
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("checkpoint_id", sa.Integer(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "photo",
                "fun_fact",
                name="media_kind",
                schema=SCHEMA,
                create_type=not _enum_exists(),
            ),
            nullable=False,
        ),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["checkpoint_id"],
            [f"{SCHEMA}.checkpoints.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_checkpoint_media_checkpoint_id",
        TABLE,
        ["checkpoint_id"],
        schema=SCHEMA,
    )


def _enum_exists() -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace "
            "WHERE t.typname = 'media_kind' AND n.nspname = :schema"
        ),
        {"schema": SCHEMA},
    )
    return result.fetchone() is not None


def downgrade() -> None:
    if not _table_exists():
        return
    op.drop_index("ix_checkpoint_media_checkpoint_id", table_name=TABLE, schema=SCHEMA)
    op.drop_table(TABLE, schema=SCHEMA)
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.media_kind")
