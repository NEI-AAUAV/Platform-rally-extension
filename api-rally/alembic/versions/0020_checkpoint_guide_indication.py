"""checkpoint guide indications

Adds ``checkpoint_guide_indication`` table: structured guidance rows (hint,
optional question + expected answer) a guide gives the team per checkpoint.
Uses a table-existence guard — fresh databases baselined via create_all may
already have the table, so we skip if it exists.

Revision ID: 0020
Revises: 0019
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "checkpoint_guide_indication"


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
        sa.Column("hint", sa.Text(), nullable=False),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column("expected_answer", sa.Text(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["checkpoint_id"],
            [f"{SCHEMA}.checkpoints.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_checkpoint_guide_indication_checkpoint_id",
        TABLE,
        ["checkpoint_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    if not _table_exists():
        return
    op.drop_index(
        "ix_checkpoint_guide_indication_checkpoint_id", table_name=TABLE, schema=SCHEMA
    )
    op.drop_table(TABLE, schema=SCHEMA)
