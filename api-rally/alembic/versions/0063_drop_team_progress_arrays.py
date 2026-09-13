"""teams: drop the positional progress arrays

`times`, `score_per_checkpoint`, `question_scores`, `time_scores`, `pukes` and
`skips` held a team's progress with array position standing in for route
position. `times` had drifted into a visit-order log while
`score_per_checkpoint` stayed route-ordered, so they disagreed as soon as a team
visited out of sequence, and any route edit after the first check-in risked
pairing a post with another post's data.

Every reader now uses the identity-keyed rows instead: `checkpoint_arrivals`,
`checkpoint_skips` and `activity_results` (see
`app.services.team_checkpoint_progress`). `question_scores`, `time_scores`,
`pukes` and `skips` were never served by the API.

`times` entries cannot be backfilled into arrivals: the array names no
checkpoint. Teams with more `times` entries than arrival rows are counted and
logged before the drop so the loss is visible in the migration output.
Downgrade restores the columns empty.

Revision ID: 0063
Revises: 0062
Create Date: 2026-09-13
"""

import logging
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0063"
down_revision: str | None = "0062"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "teams"
logger = logging.getLogger("alembic.runtime.migration")


def _array_columns() -> dict[str, sa.types.TypeEngine]:
    return {
        "times": postgresql.ARRAY(sa.DateTime(timezone=True)),
        "score_per_checkpoint": postgresql.ARRAY(sa.Integer()),
        "question_scores": postgresql.ARRAY(sa.Boolean()),
        "time_scores": postgresql.ARRAY(sa.Integer()),
        "pukes": postgresql.ARRAY(sa.Integer()),
        "skips": postgresql.ARRAY(sa.Integer()),
    }


def _log_unkeyed_visits() -> None:
    if not (column_exists(TABLE, "times", SCHEMA) and table_exists("checkpoint_arrivals", SCHEMA)):
        return
    orphaned = op.get_bind().scalar(
        sa.text(
            f"SELECT count(*) FROM {SCHEMA}.teams t "
            f"WHERE coalesce(cardinality(t.times), 0) > ("
            f"  SELECT count(*) FROM {SCHEMA}.checkpoint_arrivals a WHERE a.team_id = t.id"
            f")"
        )
    )
    if orphaned:
        logger.warning(
            "0063: %s team(s) had teams.times entries with no matching arrival row; "
            "those unkeyed visit timestamps are dropped",
            orphaned,
        )


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    _log_unkeyed_visits()
    for name in _array_columns():
        if column_exists(TABLE, name, SCHEMA):
            op.drop_column(TABLE, name, schema=SCHEMA)


def downgrade() -> None:
    if not table_exists(TABLE, SCHEMA):
        return
    for name, type_ in _array_columns().items():
        if not column_exists(TABLE, name, SCHEMA):
            op.add_column(
                TABLE,
                sa.Column(name, type_, nullable=True, server_default=sa.text("'{}'")),
                schema=SCHEMA,
            )
