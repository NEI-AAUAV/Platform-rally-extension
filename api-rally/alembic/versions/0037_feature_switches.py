"""add feature switches for the peddy-paper toolkit

Each mechanic already had a price; none had an on/off switch, and a penalty of
0 means "free", not "off". An admin mid-event needs to be able to disable a
whole mechanic without losing its configured cost.

All default TRUE: every event that already has these features keeps them.

Revision ID: 0037
Revises: 0036
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0037"
down_revision: Union[str, None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"
COLUMNS = (
    "hints_enabled",
    "skip_enabled",
    "guide_manual_arrival_enabled",
    "reveal_on_arrival",
)


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    return {c["name"] for c in sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)}


def upgrade() -> None:
    existing = _existing_columns()
    for name in COLUMNS:
        if name not in existing:
            op.add_column(
                TABLE,
                sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.true()),
                schema=SCHEMA,
            )


def downgrade() -> None:
    existing = _existing_columns()
    for name in COLUMNS:
        if name in existing:
            op.drop_column(TABLE, name, schema=SCHEMA)
