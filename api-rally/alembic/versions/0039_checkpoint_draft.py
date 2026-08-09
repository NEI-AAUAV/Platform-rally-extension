"""add draft/planning columns to checkpoints

A peddy paper route is planned long before it is complete: some posts have a
clue but no challenge, some are still only a slot ("Bar 1"). Until now the
model could only hold a finished post, so half-planned routes lived in a
document outside the app.

``is_draft`` keeps a post out of every team-facing query (route, count,
progress) while it is being written. ``is_placeholder`` marks a post whose
*name* is itself a stand-in, so the admin list can say so instead of showing
"Bar 1" as if it were decided.

``staff_script`` and ``challenge_brief`` are the two planning columns the
route document already has: what the staff at the post should talk about, and
the challenge in prose before it becomes a configured Activity. Both are
staff-only and never serialized into the participant checkpoint schema.

Revision ID: 0039
Revises: 0038
Create Date: 2026-08-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic.migration_utils import add_missing_columns, drop_present_columns
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0039"
down_revision: str | None = "0038"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "checkpoints"
COLUMNS = {
    "is_draft": sa.Column("is_draft", sa.Boolean(), nullable=False, server_default=sa.false()),
    "is_placeholder": sa.Column(
        "is_placeholder", sa.Boolean(), nullable=False, server_default=sa.false()
    ),
    "staff_script": sa.Column("staff_script", sa.Text(), nullable=True),
    "challenge_brief": sa.Column("challenge_brief", sa.Text(), nullable=True),
}


def upgrade() -> None:
    add_missing_columns(TABLE, COLUMNS, SCHEMA)


def downgrade() -> None:
    drop_present_columns(TABLE, COLUMNS, SCHEMA)
