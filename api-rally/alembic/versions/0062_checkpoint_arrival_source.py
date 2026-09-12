"""checkpoint_arrivals.source: record how an arrival was proven

Per-post progress is moving off `Team`'s positional arrays onto the
identity-keyed arrival/skip/result rows. `latitude IS NULL` was the only hint
of how a team got to a post, and it cannot tell a guide vouching apart from a
QR scan or a staff evaluation. Existing rows stay NULL (unknown).

Revision ID: 0062
Revises: 0061
Create Date: 2026-09-12
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0062"
down_revision: str | None = "0061"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "checkpoint_arrivals"
CONSTRAINT = "ck_arrival_source"


def _check_constraint_exists() -> bool:
    # ``migration_utils.constraint_exists`` only sees unique constraints.
    inspector = sa.inspect(op.get_bind())
    return any(
        c["name"] == CONSTRAINT for c in inspector.get_check_constraints(TABLE, schema=SCHEMA)
    )


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    if not column_exists(TABLE, "source", SCHEMA):
        op.add_column(TABLE, sa.Column("source", sa.String(16), nullable=True), schema=SCHEMA)
    if not _check_constraint_exists():
        op.create_check_constraint(
            CONSTRAINT,
            TABLE,
            "source IS NULL OR source IN ('gps', 'guide', 'qr', 'staff')",
            schema=SCHEMA,
        )


def downgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    if _check_constraint_exists():
        op.drop_constraint(CONSTRAINT, TABLE, schema=SCHEMA, type_="check")
    if column_exists(TABLE, "source", SCHEMA):
        op.drop_column(TABLE, "source", schema=SCHEMA)
