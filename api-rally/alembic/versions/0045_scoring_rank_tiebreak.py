"""scoring: rank tie-break timestamps + drop -1 sentinel

- teams.last_scored_at: when a team's total last changed. Tie-break for equal
  totals in the single ranking policy (assign_ranks): the team that reached the
  score first ranks ahead.
- dynamic_awards.awarded_at: when an award was issued, so it can feed
  last_scored_at the same way an activity result does.
- teams.classification: default flips from -1 to 0. -1 sorted ahead of rank 1 on
  the frontend; 0 means "unranked" and sorts last. Existing -1 rows are
  normalised to 0.
- Backfill last_scored_at from the latest completed activity result per team so
  historical ties break deterministically instead of all collapsing to "never".

Revision ID: 0045
Revises: 0044
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0045"
down_revision: str | None = "0044"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME


def upgrade() -> None:
    if table_exists("teams", SCHEMA):
        if not column_exists("teams", "last_scored_at", SCHEMA):
            op.add_column(
                "teams",
                sa.Column("last_scored_at", sa.DateTime(timezone=True), nullable=True),
                schema=SCHEMA,
            )
        op.execute(f'UPDATE "{SCHEMA}".teams SET classification = 0 WHERE classification < 0')
        op.alter_column(
            "teams",
            "classification",
            server_default="0",
            existing_type=sa.Integer(),
            schema=SCHEMA,
        )

    if table_exists("dynamic_awards", SCHEMA) and not column_exists(
        "dynamic_awards", "awarded_at", SCHEMA
    ):
        op.add_column(
            "dynamic_awards",
            sa.Column(
                "awarded_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            schema=SCHEMA,
        )

    # Backfill teams.last_scored_at from the latest completed result per team.
    if table_exists("teams", SCHEMA) and table_exists("activity_results", SCHEMA):
        op.execute(
            f"""
            UPDATE "{SCHEMA}".teams t
            SET last_scored_at = r.max_completed
            FROM (
                SELECT team_id, MAX(completed_at) AS max_completed
                FROM "{SCHEMA}".activity_results
                WHERE is_completed IS TRUE AND completed_at IS NOT NULL
                GROUP BY team_id
            ) r
            WHERE r.team_id = t.id AND t.last_scored_at IS NULL
            """
        )


def downgrade() -> None:
    if table_exists("dynamic_awards", SCHEMA) and column_exists(
        "dynamic_awards", "awarded_at", SCHEMA
    ):
        op.drop_column("dynamic_awards", "awarded_at", schema=SCHEMA)

    if table_exists("teams", SCHEMA):
        op.alter_column(
            "teams",
            "classification",
            server_default="-1",
            existing_type=sa.Integer(),
            schema=SCHEMA,
        )
        if column_exists("teams", "last_scored_at", SCHEMA):
            op.drop_column("teams", "last_scored_at", schema=SCHEMA)
