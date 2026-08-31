"""checkpoint_guide_indication: one row per (checkpoint, order)

``order`` is the rung on a post's hint ladder — ``HintService.reveal_next``
buys "the next one" by it, and ``CheckpointHintReveal`` records which one a
team paid for. Two rows sharing an order at the same post make that ambiguous:
which hint the team bought depends on row order.

Colliding rows are renumbered rather than deleted — they hold hint text
someone wrote, and a duplicate order is a data-entry slip, not a duplicate
row. Each collision group keeps its lowest id at the original order and the
rest are pushed onto free orders above the post's current maximum, preserving
their relative sequence.

Revision ID: 0052
Revises: 0051
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from alembic.migration_utils import table_exists
from app.core.config import settings

revision: str = "0052"
down_revision: str | None = "0051"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "checkpoint_guide_indication"
CONSTRAINT = "uq_guide_indication_checkpoint_order"


def _constraint_exists() -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE, schema=SCHEMA):
        return True  # nothing to do either way
    return any(
        uc["name"] == CONSTRAINT for uc in inspector.get_unique_constraints(TABLE, schema=SCHEMA)
    )


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA) or _constraint_exists():
        return

    op.execute(
        sa.text(
            f"""
            WITH ranked AS (
                SELECT
                    id,
                    checkpoint_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY checkpoint_id, "order" ORDER BY id
                    ) AS dup_rank
                FROM {SCHEMA}.{TABLE}
            ),
            maxes AS (
                SELECT checkpoint_id, MAX("order") AS max_order
                FROM {SCHEMA}.{TABLE}
                GROUP BY checkpoint_id
            ),
            renumbered AS (
                SELECT
                    r.id,
                    m.max_order
                        + ROW_NUMBER() OVER (PARTITION BY r.checkpoint_id ORDER BY r.id)
                        AS new_order
                FROM ranked r
                JOIN maxes m ON m.checkpoint_id = r.checkpoint_id
                WHERE r.dup_rank > 1
            )
            UPDATE {SCHEMA}.{TABLE} t
            SET "order" = renumbered.new_order
            FROM renumbered
            WHERE t.id = renumbered.id
            """
        )
    )
    op.create_unique_constraint(CONSTRAINT, TABLE, ["checkpoint_id", "order"], schema=SCHEMA)


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT, TABLE, schema=SCHEMA, type_="unique")
