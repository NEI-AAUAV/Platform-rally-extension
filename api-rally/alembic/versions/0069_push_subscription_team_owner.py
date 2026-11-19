"""push_subscriptions.team_id: let team sessions subscribe a device

Teams play from a team-token session, not an account, so their phones could
never subscribe and rally-wide announcements reached nobody on the field. A
subscription is now owned by exactly one of a user or a team.

Revision ID: 0069
Revises: 0068
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0069"
down_revision: str | None = "0068"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "push_subscriptions"
COLUMN = "team_id"
FK = "fk_push_subscriptions_team_id"
CHECK = "ck_push_subscriptions_single_owner"


def _check_exists() -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(c["name"] == CHECK for c in inspector.get_check_constraints(TABLE, schema=SCHEMA))


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    if not column_exists(TABLE, COLUMN, SCHEMA):
        op.add_column(TABLE, sa.Column(COLUMN, sa.Integer(), nullable=True), schema=SCHEMA)
        op.create_foreign_key(
            FK,
            TABLE,
            "teams",
            [COLUMN],
            ["id"],
            source_schema=SCHEMA,
            referent_schema=SCHEMA,
            ondelete="CASCADE",
        )
    op.alter_column(TABLE, "user_id", existing_type=sa.Integer(), nullable=True, schema=SCHEMA)
    if not _check_exists():
        op.create_check_constraint(
            CHECK, TABLE, "(user_id IS NULL) <> (team_id IS NULL)", schema=SCHEMA
        )


def downgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    if _check_exists():
        op.drop_constraint(CHECK, TABLE, schema=SCHEMA, type_="check")
    if column_exists(TABLE, COLUMN, SCHEMA):
        # Team-owned rows have no user to fall back to; they can't survive
        # the NOT NULL user_id the old schema requires.
        op.execute(f'DELETE FROM "{SCHEMA}"."{TABLE}" WHERE user_id IS NULL')
        # Dropping the column drops its FK too, whichever name it got
        # (ours from upgrade(), or create_all's auto-generated one).
        op.drop_column(TABLE, COLUMN, schema=SCHEMA)
    op.alter_column(TABLE, "user_id", existing_type=sa.Integer(), nullable=False, schema=SCHEMA)
