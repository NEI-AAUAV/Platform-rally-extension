"""idempotency_keys.completed_at: distinguish reserved from finished

reserve_idempotency_key flushes a reservation row with response_body={}
before the write runs, so the row becomes visible to concurrent requests
before that write's own db.commit() lands. If the process crashes (or a
later step in the same request raises) after that commit but before
store_idempotent_response fills in the real response, the row is durable
with an empty body. A retry against that key hit reservation.replay is not
None -> ActivityResultResponse.model_validate({}) -> ValidationError -> 500,
forever, since nothing ever fills in a real response afterwards.

completed_at is set only by store_idempotent_response, once the real
response is written. reserve_idempotency_key now treats a row with
completed_at IS NULL as in-flight and raises 409 (Retry-After) instead of
replaying the placeholder.

No backfill: existing rows predate this column and have no way to know
whether they finished. Backfilling them to "now" would let a genuinely
crashed-and-never-finished old row start replaying {} the instant this
migration runs — the opposite of what it's for. They're covered by the
defensive `if not found.response_body` check for a row's completed_at
already set without a body.

Revision ID: 0048
Revises: 0047
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0048"
down_revision: str | None = "0047"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME


def upgrade() -> None:
    if table_exists("idempotency_keys", SCHEMA) and not column_exists(
        "idempotency_keys", "completed_at", SCHEMA
    ):
        op.add_column(
            "idempotency_keys",
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            schema=SCHEMA,
        )


def downgrade() -> None:
    if table_exists("idempotency_keys", SCHEMA) and column_exists(
        "idempotency_keys", "completed_at", SCHEMA
    ):
        op.drop_column("idempotency_keys", "completed_at", schema=SCHEMA)
