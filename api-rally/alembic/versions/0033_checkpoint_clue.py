"""add participant clue columns to checkpoints

A peddy paper hands the team a riddle whose answer is the checkpoint's own
location. That is the opposite of CheckpointGuideIndication.hint, which a guide
reads out to a team that has already arrived, so it gets its own columns rather
than reusing that table.

Both columns are nullable: when ``clue`` is NULL the participant card shows
nothing and the event runs guided exactly as before, so the two models coexist
without an extra feature flag.

Revision ID: 0033
Revises: 0032
Create Date: 2026-08-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "checkpoints"
COLUMNS = {
    "clue": sa.Column("clue", sa.Text(), nullable=True),
    "clue_media_url": sa.Column("clue_media_url", sa.String(length=500), nullable=True),
}


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    return {c["name"] for c in sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)}


def upgrade() -> None:
    existing = _existing_columns()
    for name, column in COLUMNS.items():
        if name not in existing:
            op.add_column(TABLE, column, schema=SCHEMA)


def downgrade() -> None:
    existing = _existing_columns()
    for name in COLUMNS:
        if name in existing:
            op.drop_column(TABLE, name, schema=SCHEMA)
