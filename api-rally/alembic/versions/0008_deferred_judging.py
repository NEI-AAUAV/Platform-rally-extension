"""deferred judging — media_urls + judgment_status on activity_results

Adds media_urls (JSON array of R2 URLs) and judgment_status (pending_judgment|judged|NULL)
to activity_results, enabling the deferred-judged activity flow.

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "activity_results"


def _column_exists(column: str) -> bool:
    bind = op.get_bind()
    cols = [c["name"] for c in sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)]
    return column in cols


def upgrade() -> None:
    if not _column_exists("media_urls"):
        op.add_column(
            TABLE,
            sa.Column("media_urls", sa.JSON(), nullable=False, server_default="[]"),
            schema=SCHEMA,
        )
    if not _column_exists("judgment_status"):
        op.add_column(
            TABLE,
            sa.Column("judgment_status", sa.String(20), nullable=True),
            schema=SCHEMA,
        )


def downgrade() -> None:
    if _column_exists("judgment_status"):
        op.drop_column(TABLE, "judgment_status", schema=SCHEMA)
    if _column_exists("media_urls"):
        op.drop_column(TABLE, "media_urls", schema=SCHEMA)
