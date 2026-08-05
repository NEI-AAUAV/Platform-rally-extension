"""scope badge_definitions to an event

Adds a nullable event_id FK on badge_definitions, matching the pattern used
by teams/checkpoints/activities. Existing rows (seeded defaults + anything
created before this migration) are left NULL, which the list query treats as
"visible in every event" (same NULL-fallback pattern as Team/CheckPoint).

Revision ID: 0019
Revises: 0018
Create Date: 2026-07-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "badge_definitions"
COLUMN = "event_id"


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    columns = sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)
    return {c["name"] for c in columns}


def upgrade() -> None:
    if COLUMN in _existing_columns():
        return
    op.add_column(
        TABLE,
        sa.Column(COLUMN, sa.Integer(), nullable=True),
        schema=SCHEMA,
    )
    op.create_foreign_key(
        "fk_badge_definitions_event_id",
        TABLE,
        "rally_events",
        [COLUMN],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
    )


def downgrade() -> None:
    if COLUMN not in _existing_columns():
        return
    op.drop_constraint("fk_badge_definitions_event_id", TABLE, schema=SCHEMA, type_="foreignkey")
    op.drop_column(TABLE, COLUMN, schema=SCHEMA)
