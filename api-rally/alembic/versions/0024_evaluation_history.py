"""evaluation_history audit-trail table

Creates ``evaluation_history`` — one immutable row per edit or contest of an
activity result (who changed what, when). Guarded because ``create_all`` may
already have created the table on installs that ran the app before this
migration; an unguarded create_table would crash there.

Revision ID: 0024
Revises: 0023
Create Date: 2026-07-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "evaluation_history"


def _has_table(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table, schema=SCHEMA)


def upgrade() -> None:
    if _has_table(TABLE):
        return

    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("result_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("editor_id", sa.String(255), nullable=True),
        sa.Column("editor_name", sa.String(255), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["result_id"],
            [f"{SCHEMA}.activity_results.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_evaluation_history_result_id", TABLE, ["result_id"], schema=SCHEMA
    )
    op.create_index(
        "ix_evaluation_history_created_at", TABLE, ["created_at"], schema=SCHEMA
    )


def downgrade() -> None:
    if _has_table(TABLE):
        op.drop_table(TABLE, schema=SCHEMA)
