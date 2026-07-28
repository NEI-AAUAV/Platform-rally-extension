"""audit_log general audit-trail table

Creates ``audit_log`` — one immutable row per non-evaluation administrative
action (settings changes, badge grants, staff reassignment, check-ins,
exports). Sibling to ``evaluation_history``, which stays scoped to evaluation
edits/contests. Guarded because ``create_all`` may already have created the
table on installs that ran the app before this migration.

Revision ID: 0027
Revises: 0026
Create Date: 2026-07-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "audit_log"


def _has_table(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table, schema=SCHEMA)


def upgrade() -> None:
    if _has_table(TABLE):
        return

    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=True),
        sa.Column("actor_id", sa.String(255), nullable=True),
        sa.Column("actor_name", sa.String(255), nullable=True),
        sa.Column("actor_kind", sa.String(20), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("target_id", sa.String(50), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["event_id"],
            [f"{SCHEMA}.rally_events.id"],
            ondelete="SET NULL",
        ),
        schema=SCHEMA,
    )
    op.create_index("ix_audit_log_event_id", TABLE, ["event_id"], schema=SCHEMA)
    op.create_index("ix_audit_log_action", TABLE, ["action"], schema=SCHEMA)
    op.create_index("ix_audit_log_created_at", TABLE, ["created_at"], schema=SCHEMA)


def downgrade() -> None:
    if _has_table(TABLE):
        op.drop_table(TABLE, schema=SCHEMA)
