"""drop team score history

Removes the team_score_history table. It existed solely to power the
post-event replay feature, which has been removed.

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-30
"""
from typing import Sequence, Union

from alembic.migration_utils import (
    create_team_score_history_table,
    drop_team_score_history_table,
    table_exists,
)
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "team_score_history"


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    drop_team_score_history_table(SCHEMA)


def downgrade() -> None:
    if table_exists(TABLE, SCHEMA):
        return
    create_team_score_history_table(SCHEMA)
