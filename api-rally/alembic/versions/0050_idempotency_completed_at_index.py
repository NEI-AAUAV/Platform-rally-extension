"""idempotency_keys.completed_at: index for the TTL purge query

M13: idempotency_keys had no TTL/cleanup at all -- unbounded growth. The
purge query (``purge_expired_idempotency_keys``) filters on
``completed_at < cutoff``; without an index that's a full table scan on a
table with no natural cap on size.

Revision ID: 0050
Revises: 0049
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from alembic.migration_utils import table_exists
from app.core.config import settings

revision: str = "0050"
down_revision: str | None = "0049"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
INDEX_NAME = "ix_idempotency_keys_completed_at"


def _index_exists() -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("idempotency_keys", schema=SCHEMA):
        return True
    return any(
        ix["name"] == INDEX_NAME
        for ix in inspector.get_indexes("idempotency_keys", schema=SCHEMA)
    )


def upgrade() -> None:
    if table_exists("idempotency_keys", SCHEMA) and not _index_exists():
        op.create_index(
            INDEX_NAME,
            "idempotency_keys",
            ["completed_at"],
            schema=SCHEMA,
        )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="idempotency_keys", schema=SCHEMA)
