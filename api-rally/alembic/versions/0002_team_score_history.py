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

from alembic._migration_utils import (
    create_team_score_history_table,
    drop_team_score_history_table,
    table_exists,
)
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "team_score_history"


def upgrade() -> None:
    if table_exists(TABLE, SCHEMA):
        return
    create_team_score_history_table(SCHEMA)


def downgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    drop_team_score_history_table(SCHEMA)
