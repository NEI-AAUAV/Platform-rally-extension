"""idempotency_keys store for retryable write endpoints

Creates ``idempotency_keys`` — one row per (endpoint, idempotency_key) holding
a request fingerprint and the response to replay. Lets staff evaluate submits
be retried (by the client offline queue) without re-scoring or clobbering a
prior result. Guarded because ``create_all`` may already have created the table
on installs that ran the app before this migration.

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "idempotency_keys"


def _has_table(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table, schema=SCHEMA)


def upgrade() -> None:
    if _has_table(TABLE):
        return

    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("endpoint", sa.String(255), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("response_body", sa.JSON(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False, server_default=sa.text("200")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint", "idempotency_key", name="uq_idempotency_keys_endpoint_key"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_idempotency_keys_idempotency_key",
        TABLE,
        ["idempotency_key"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    if _has_table(TABLE):
        op.drop_table(TABLE, schema=SCHEMA)
