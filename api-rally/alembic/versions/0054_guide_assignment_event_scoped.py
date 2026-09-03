"""rally_guide_assignment: one row per (user, team), not per user

The table's only uniqueness was ``uq_rally_guide_assignment_user_id`` — a
single assignment per guide *ever*. A guide who worked one edition and returns
for the next had their historical row repointed by ``create_or_update``
instead of getting a fresh assignment for the current edition, and the
lookup (``get_by_user_id``) returned that stale cross-edition row.

This brings guide assignments in line with staff (see 0051): the pair
``(user_id, team_id)`` is unique, and the CRUD lookups join ``team`` and
filter the current event. No dedup step is needed — the old constraint
guaranteed at most one row per user.

Revision ID: 0054
Revises: 0053
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import table_exists
from app.core.config import settings

revision: str = "0054"
down_revision: str | None = "0053"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_guide_assignment"
OLD_CONSTRAINT = "uq_rally_guide_assignment_user_id"
NEW_CONSTRAINT = "uq_guide_assignment_user_team"


def _unique_names() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE, schema=SCHEMA):
        return set()
    return {uc["name"] for uc in inspector.get_unique_constraints(TABLE, schema=SCHEMA)}


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    existing = _unique_names()
    if OLD_CONSTRAINT in existing:
        op.drop_constraint(OLD_CONSTRAINT, TABLE, schema=SCHEMA, type_="unique")
    if NEW_CONSTRAINT not in existing:
        op.create_unique_constraint(NEW_CONSTRAINT, TABLE, ["user_id", "team_id"], schema=SCHEMA)


def downgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    existing = _unique_names()
    if NEW_CONSTRAINT in existing:
        op.drop_constraint(NEW_CONSTRAINT, TABLE, schema=SCHEMA, type_="unique")
    if OLD_CONSTRAINT not in existing:
        # Collapse any rows that would violate the restored per-user uniqueness,
        # keeping the lowest id.
        op.execute(
            sa.text(
                f"""
                DELETE FROM {SCHEMA}.{TABLE} a
                USING {SCHEMA}.{TABLE} b
                WHERE a.id > b.id
                  AND a.user_id = b.user_id
                """
            )
        )
        op.create_unique_constraint(OLD_CONSTRAINT, TABLE, ["user_id"], schema=SCHEMA)
