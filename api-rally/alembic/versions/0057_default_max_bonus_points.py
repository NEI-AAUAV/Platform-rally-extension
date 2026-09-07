"""rally_settings.default_max_bonus_points: event-wide ceiling on performance bonus

`Activity.config.max_bonus_points` caps the bonus for one activity, but global
bonus rules (DynamicRule with rule_type="bonus_counter") apply at every
checkpoint and have no ceiling of their own. On an activity that sets no cap of
its own, the awarded bonus was therefore unbounded.

This column is the event's default: any activity that does not set
`max_bonus_points` is capped by it instead. An activity that does set one still
wins — this is a fallback, not a second limit.

Nullable rather than defaulted, because NULL and 0 mean different things here:
NULL is "no ceiling", 0 is a real ceiling of zero. That is the same distinction
`config.max_bonus_points` already draws, and the reason the "0 disables it"
convention used by hint_penalty/skip_penalty does not fit.

Revision ID: 0057
Revises: 0056
Create Date: 2026-09-07
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0057"
down_revision: str | None = "0056"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME


def upgrade() -> None:
    if table_exists("rally_settings", SCHEMA) and not column_exists(
        "rally_settings", "default_max_bonus_points", SCHEMA
    ):
        op.add_column(
            "rally_settings",
            sa.Column("default_max_bonus_points", sa.Integer(), nullable=True),
            schema=SCHEMA,
        )


def downgrade() -> None:
    if table_exists("rally_settings", SCHEMA) and column_exists(
        "rally_settings", "default_max_bonus_points", SCHEMA
    ):
        op.drop_column("rally_settings", "default_max_bonus_points", schema=SCHEMA)
