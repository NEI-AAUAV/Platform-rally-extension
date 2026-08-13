"""add leg-time scoring settings

Bonus/penalty for how long a team takes between two consecutive checkpoint
arrivals, against a configurable target duration — separate toggle from its
rate, same convention as every other scoring switch in this table (a rate of
0 already makes it a no-op even with the switch on).

All four default to off/inert, so no existing event changes behaviour.

Revision ID: 0042
Revises: 0041
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic.migration_utils import add_missing_columns, drop_present_columns
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0042"
down_revision: str | None = "0041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"
COLUMNS: dict[str, sa.Column] = {
    "leg_time_scoring_enabled": sa.Column(
        "leg_time_scoring_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
    ),
    "leg_time_target_minutes": sa.Column(
        "leg_time_target_minutes", sa.Integer(), nullable=False, server_default="10"
    ),
    "leg_time_points_per_minute": sa.Column(
        "leg_time_points_per_minute", sa.Integer(), nullable=False, server_default="0"
    ),
    "leg_time_max_adjustment": sa.Column(
        "leg_time_max_adjustment", sa.Integer(), nullable=False, server_default="20"
    ),
}


def upgrade() -> None:
    add_missing_columns(TABLE, COLUMNS, SCHEMA)


def downgrade() -> None:
    drop_present_columns(TABLE, COLUMNS, SCHEMA)
