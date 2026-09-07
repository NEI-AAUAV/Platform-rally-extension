"""dynamic_rules.deleted_at: tell "switched off" apart from "deleted"

`is_active` was carrying both meanings at once. `list_rules` filtered on it and
the admin read that same listing, so switching a rule off made its row vanish —
leaving nothing to switch back on, and looking exactly like a deletion.
`delete_rule` then set the same flag, so the two actions produced literally the
same state.

This column is the tombstone, leaving `is_active` to be only the admin's
on/off switch. Neither removes the row: results already scored carry the rule's
`g_<id>` / `gb_<id>` key, and pricing them back (penalty_prices /
bonus_prices with include_inactive=True) is what keeps an edit or a retroactive
recompute from failing on an orphaned key.

Backfill: rows currently at is_active=False are marked deleted. Both paths
produced that state today and both hid the row, so reading them as deletions is
the only interpretation that leaves the admin's view unchanged by this
migration.

Revision ID: 0058
Revises: 0057
Create Date: 2026-09-07
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0058"
down_revision: str | None = "0057"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME


def upgrade() -> None:
    if not table_exists("dynamic_rules", SCHEMA):
        return
    if column_exists("dynamic_rules", "deleted_at", SCHEMA):
        return

    op.add_column(
        "dynamic_rules",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    op.execute(
        f'UPDATE "{SCHEMA}".dynamic_rules '
        "SET deleted_at = now() WHERE is_active = false AND deleted_at IS NULL"
    )


def downgrade() -> None:
    if table_exists("dynamic_rules", SCHEMA) and column_exists(
        "dynamic_rules", "deleted_at", SCHEMA
    ):
        op.drop_column("dynamic_rules", "deleted_at", schema=SCHEMA)
