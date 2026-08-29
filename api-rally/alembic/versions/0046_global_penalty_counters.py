"""dynamic scoring: global penalty counters + excess-penalty awards

- dynamic_awards.activity_result_id: set when the award is the auto-recorded
  shortfall for an activity result whose penalties exceeded its points, so the
  excess still reaches team.total instead of vanishing at the per-activity floor.
  FK ON DELETE CASCADE — the award dies with its result.
- dynamic_rules.is_automatic: dropped. DynamicRule is now only a global penalty
  counter shown to staff at every checkpoint; there is no automatic variant.
- dynamic_awards.rule_id: dropped. Rules are no longer award templates.
- Existing dynamic_rules rows are normalised to rule_type = 'penalty_counter'.

Revision ID: 0046
Revises: 0045
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0046"
down_revision: str | None = "0045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME


def upgrade() -> None:
    if table_exists("dynamic_awards", SCHEMA):
        if not column_exists("dynamic_awards", "activity_result_id", SCHEMA):
            op.add_column(
                "dynamic_awards",
                sa.Column("activity_result_id", sa.Integer(), nullable=True),
                schema=SCHEMA,
            )
            op.create_foreign_key(
                "fk_dynamic_awards_activity_result_id",
                "dynamic_awards",
                "activity_results",
                ["activity_result_id"],
                ["id"],
                source_schema=SCHEMA,
                referent_schema=SCHEMA,
                ondelete="CASCADE",
            )
            op.create_index(
                "ix_dynamic_awards_activity_result_id",
                "dynamic_awards",
                ["activity_result_id"],
                schema=SCHEMA,
            )
        if column_exists("dynamic_awards", "rule_id", SCHEMA):
            op.drop_column("dynamic_awards", "rule_id", schema=SCHEMA)

    if table_exists("dynamic_rules", SCHEMA):
        op.execute(
            f"UPDATE \"{SCHEMA}\".dynamic_rules SET rule_type = 'penalty_counter'"
        )
        if column_exists("dynamic_rules", "is_automatic", SCHEMA):
            op.drop_column("dynamic_rules", "is_automatic", schema=SCHEMA)


def downgrade() -> None:
    if table_exists("dynamic_rules", SCHEMA) and not column_exists(
        "dynamic_rules", "is_automatic", SCHEMA
    ):
        op.add_column(
            "dynamic_rules",
            sa.Column(
                "is_automatic",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
            schema=SCHEMA,
        )

    if table_exists("dynamic_awards", SCHEMA):
        if not column_exists("dynamic_awards", "rule_id", SCHEMA):
            op.add_column(
                "dynamic_awards",
                sa.Column("rule_id", sa.Integer(), nullable=True),
                schema=SCHEMA,
            )
        if column_exists("dynamic_awards", "activity_result_id", SCHEMA):
            op.drop_index(
                "ix_dynamic_awards_activity_result_id",
                table_name="dynamic_awards",
                schema=SCHEMA,
            )
            op.drop_constraint(
                "fk_dynamic_awards_activity_result_id",
                "dynamic_awards",
                schema=SCHEMA,
                type_="foreignkey",
            )
            op.drop_column("dynamic_awards", "activity_result_id", schema=SCHEMA)
