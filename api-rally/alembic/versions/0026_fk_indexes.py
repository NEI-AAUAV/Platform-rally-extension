"""Add missing foreign-key indexes for join / filter performance

Postgres does not auto-index foreign-key columns. Unindexed FK columns force
sequential scans on joins and slow ON DELETE cascades. This adds covering
indexes on the FK columns queried by hot read/write paths — e.g.
``activity_results.team_id`` (filtered alone in ``calculate_team_total_score``,
not covered by the (activity_id, team_id) unique constraint) and the various
event/team/checkpoint references used by scoring and assignment lookups.

Each index is created idempotently (guarded on existence) so installs that
already ran ``create_all`` or a partial migration converge cleanly.

Revision ID: 0026
Revises: 0025
Create Date: 2026-07-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME

# (index_name, table, column)
_INDEXES: tuple[tuple[str, str, str], ...] = (
    ("ix_user_team_id", "user", "team_id"),
    ("ix_user_staff_checkpoint_id", "user", "staff_checkpoint_id"),
    ("ix_activity_results_team_id", "activity_results", "team_id"),
    ("ix_dynamic_awards_team_id", "dynamic_awards", "team_id"),
    ("ix_dynamic_awards_event_id", "dynamic_awards", "event_id"),
    ("ix_dynamic_awards_rule_id", "dynamic_awards", "rule_id"),
    ("ix_event_participation_team_id", "event_participation", "team_id"),
    ("ix_rally_staff_assignment_checkpoint_id", "rally_staff_assignment", "checkpoint_id"),
    ("ix_rally_staff_assignment_user_id", "rally_staff_assignment", "user_id"),
    ("ix_rally_guide_assignment_checkpoint_id", "rally_guide_assignment", "checkpoint_id"),
    ("ix_badge_definitions_event_id", "badge_definitions", "event_id"),
)


def _existing_indexes(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table, schema=SCHEMA):
        return set()
    return {ix["name"] for ix in inspector.get_indexes(table, schema=SCHEMA)}


def upgrade() -> None:
    for name, table, column in _INDEXES:
        if name in _existing_indexes(table):
            continue
        op.create_index(name, table, [column], schema=SCHEMA)


def downgrade() -> None:
    for name, table, _column in _INDEXES:
        if name in _existing_indexes(table):
            op.drop_index(name, table_name=table, schema=SCHEMA)
