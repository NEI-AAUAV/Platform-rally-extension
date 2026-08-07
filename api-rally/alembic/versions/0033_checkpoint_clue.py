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

from alembic.migration_utils import add_missing_columns, drop_present_columns
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


def upgrade() -> None:
    add_missing_columns(TABLE, COLUMNS, SCHEMA)


def downgrade() -> None:
    drop_present_columns(TABLE, COLUMNS, SCHEMA)
