"""rally guide assignments

Adds ``rally_guide_assignment`` table linking guide users to checkpoints,
mirroring ``rally_staff_assignment``. Table-existence guarded because fresh
databases may already have it via create_all.

Revision ID: 0021
Revises: 0020
Create Date: 2026-07-03
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_guide_assignment"


def _table_exists() -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(TABLE, schema=SCHEMA)


def upgrade() -> None:
    if _table_exists():
        return
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("checkpoint_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["checkpoint_id"],
            [f"{SCHEMA}.checkpoints.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        schema=SCHEMA,
    )


def downgrade() -> None:
    if not _table_exists():
        return
    op.drop_table(TABLE, schema=SCHEMA)
