"""drop team score history

Removes the team_score_history table. It existed solely to power the
post-event replay feature, which has been removed.

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "team_score_history"


def _table_exists() -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(TABLE, schema=SCHEMA)


def upgrade() -> None:
    if not _table_exists():
        return
    op.drop_index(
        "ix_score_history_event_time",
        table_name=TABLE,
        schema=SCHEMA,
    )
    op.drop_table(TABLE, schema=SCHEMA)


def downgrade() -> None:
    if _table_exists():
        return
    op.create_table(
        "team_score_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "event_id",
            sa.Integer(),
            sa.ForeignKey(f"{SCHEMA}.rally_events.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "team_id",
            sa.Integer(),
            sa.ForeignKey(f"{SCHEMA}.teams.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_score_history_event_time",
        "team_score_history",
        ["event_id", "recorded_at"],
        schema=SCHEMA,
    )
