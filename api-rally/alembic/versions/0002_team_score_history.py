"""team score history

Adds the append-only team_score_history table that powers the post-event
replay. Written as an explicit additive migration (not create_all) — exactly
the case the legacy bootstrap could not handle on a database that already has
data.

Idempotent because the 0001 baseline runs ``create_all`` over the *current*
models: on a brand-new database upgraded straight from base, this table already
exists by the time 0002 runs, whereas a pre-existing database baselined at 0001
(before this table existed) needs it created. The existence guard makes both
paths converge.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "team_score_history"


def _table_exists() -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(TABLE, schema=SCHEMA)


def upgrade() -> None:
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


def downgrade() -> None:
    if not _table_exists():
        return
    op.drop_index(
        "ix_score_history_event_time",
        table_name=TABLE,
        schema=SCHEMA,
    )
    op.drop_table(TABLE, schema=SCHEMA)
