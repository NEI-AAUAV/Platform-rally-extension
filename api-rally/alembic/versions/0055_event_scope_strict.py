"""Every event-scoped row belongs to exactly one event

``event_id`` was nullable on every child table and no migration ever
backfilled it, so rows created before events existed (or by seeds that did not
stamp them) sat at NULL. Roughly thirty queries papered over that with
``(X.event_id == event_id) | (X.event_id.is_(None))``, which made a NULL row
show up in *every* edition — and it was the same row, not a copy, so scoring a
team in the new edition mutated the old one's standings.

This backfills the orphans onto the oldest event (the edition they actually
belonged to) and makes ``event_id`` NOT NULL, so the fallback can be deleted
from the query layer without leaving rows stranded and invisible.

``badge_definitions.code`` was globally unique, which made a per-event badge
catalogue impossible — cloning an edition would collide on the first code. It
becomes unique per (event_id, code), matching ``uq_team_event_name`` and
``uq_checkpoint_event_order``.

Revision ID: 0055
Revises: 0054
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, constraint_exists, table_exists
from app.core.config import settings

revision: str = "0055"
down_revision: str | None = "0054"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME

# Tables whose event_id is a hard ownership link. audit_log is deliberately
# excluded: its FK is ON DELETE SET NULL, so NULL is a meaningful state there.
SCOPED_TABLES = (
    "teams",
    "checkpoints",
    "activities",
    "route_stages",
    "badge_definitions",
    "dynamic_rules",
    "dynamic_awards",
    "rally_settings",
)

BADGE_TABLE = "badge_definitions"
BADGE_CODE_UNIQUE = "uq_badge_definition_event_code"
# create_all names the column-level unique on code after the index it backs.
BADGE_CODE_LEGACY_INDEX = "ix_badge_definitions_code"

# Mirrors crud_activity.CRUDRallyEvent.ensure_current's bootstrap, so a
# database with orphan rows but no event still has somewhere to put them.
DEFAULT_EVENT_SLUG = "rally-tascas"
DEFAULT_EVENT_NAME = "Rally Tascas"


def _target_event_id() -> int | None:
    """The oldest event — the edition the orphan rows belong to.

    Creates the default event when the table is empty but orphans exist.
    Returns None when there is nothing to scope (empty install).
    """
    bind = op.get_bind()
    event_id = bind.scalar(sa.text(f"SELECT id FROM {SCHEMA}.rally_events ORDER BY id LIMIT 1"))
    if event_id is not None:
        return int(event_id)

    if not any(_orphan_count(table) for table in SCOPED_TABLES):
        return None

    return int(
        bind.scalar(
            sa.text(
                f"""
                INSERT INTO {SCHEMA}.rally_events (name, slug, is_active, is_current)
                VALUES (:name, :slug, TRUE, TRUE)
                RETURNING id
                """
            ),
            {"name": DEFAULT_EVENT_NAME, "slug": DEFAULT_EVENT_SLUG},
        )
    )


def _orphan_count(table: str) -> int:
    if not table_exists(table, SCHEMA) or not column_exists(table, "event_id", SCHEMA):
        return 0
    bind = op.get_bind()
    return int(
        bind.scalar(sa.text(f"SELECT count(*) FROM {SCHEMA}.{table} WHERE event_id IS NULL"))
    )


def upgrade() -> None:
    target_event_id = _target_event_id()

    for table in SCOPED_TABLES:
        if not table_exists(table, SCHEMA) or not column_exists(table, "event_id", SCHEMA):
            continue
        if target_event_id is not None:
            op.execute(
                sa.text(
                    f"UPDATE {SCHEMA}.{table} SET event_id = :event_id WHERE event_id IS NULL"
                ).bindparams(event_id=target_event_id)
            )
        op.alter_column(table, "event_id", nullable=False, schema=SCHEMA)

    _swap_badge_code_unique()


def _swap_badge_code_unique() -> None:
    """Widen the badge code uniqueness from global to per-event."""
    if not table_exists(BADGE_TABLE, SCHEMA):
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for constraint in inspector.get_unique_constraints(BADGE_TABLE, schema=SCHEMA):
        if constraint["column_names"] == ["code"]:
            op.drop_constraint(constraint["name"], BADGE_TABLE, schema=SCHEMA, type_="unique")

    indexes = {ix["name"]: ix for ix in inspector.get_indexes(BADGE_TABLE, schema=SCHEMA)}
    legacy = indexes.get(BADGE_CODE_LEGACY_INDEX)
    if legacy is not None and legacy.get("unique"):
        op.drop_index(BADGE_CODE_LEGACY_INDEX, table_name=BADGE_TABLE, schema=SCHEMA)
        op.create_index(BADGE_CODE_LEGACY_INDEX, BADGE_TABLE, ["code"], unique=False, schema=SCHEMA)

    if not constraint_exists(BADGE_TABLE, SCHEMA, BADGE_CODE_UNIQUE):
        op.create_unique_constraint(
            BADGE_CODE_UNIQUE, BADGE_TABLE, ["event_id", "code"], schema=SCHEMA
        )


def downgrade() -> None:
    # The backfill is not reversed: which rows were orphans is not recoverable
    # once they carry an event_id.
    for table in SCOPED_TABLES:
        if table_exists(table, SCHEMA) and column_exists(table, "event_id", SCHEMA):
            op.alter_column(table, "event_id", nullable=True, schema=SCHEMA)

    if not table_exists(BADGE_TABLE, SCHEMA):
        return
    if constraint_exists(BADGE_TABLE, SCHEMA, BADGE_CODE_UNIQUE):
        op.drop_constraint(BADGE_CODE_UNIQUE, BADGE_TABLE, schema=SCHEMA, type_="unique")
    # Restoring the global unique needs duplicate codes collapsed first.
    op.execute(
        sa.text(
            f"""
            DELETE FROM {SCHEMA}.{BADGE_TABLE} a
            USING {SCHEMA}.{BADGE_TABLE} b
            WHERE a.id > b.id
              AND a.code = b.code
            """
        )
    )
    op.drop_index(BADGE_CODE_LEGACY_INDEX, table_name=BADGE_TABLE, schema=SCHEMA)
    op.create_index(BADGE_CODE_LEGACY_INDEX, BADGE_TABLE, ["code"], unique=True, schema=SCHEMA)
