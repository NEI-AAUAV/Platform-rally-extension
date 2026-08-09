"""add route stages and per-checkpoint opening hours

A real peddy paper route is not one uniform list. The planning document splits
it in two: a block inside the university walked in order, and a block of bars
outside it where the team picks which ones to visit and how many. Until now
``checkpoint_order_matters`` was a single switch for the whole event, so one
half of the route always ran under the wrong rule.

A **stage** is a contiguous block of posts with its own rule: ordered or free,
and how many of its posts a team must resolve before moving on
(``required_count``, NULL meaning all of them).

**Opening hours** are the other half of the same problem: the bars only open
late, and a route that sends a team to a closed door at 6pm is broken in a way
no ordering rule fixes. ``available_from``/``available_until`` are nullable, so
a post without hours behaves exactly as before.

Both mechanics get a switch of their own (``route_stages_enabled``,
``checkpoint_hours_enabled``) so an admin can turn either off mid-event —
a bar opening early should not require clearing every window in the route.

Revision ID: 0040
Revises: 0039
Create Date: 2026-08-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import add_missing_columns, drop_present_columns, table_exists
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0040"
down_revision: str | None = "0039"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
STAGES_TABLE = "route_stages"
CHECKPOINTS_TABLE = "checkpoints"
SETTINGS_TABLE = "rally_settings"

CHECKPOINT_COLUMNS = {
    "stage_id": sa.Column("stage_id", sa.Integer(), nullable=True),
    "available_from": sa.Column("available_from", sa.DateTime(timezone=True), nullable=True),
    "available_until": sa.Column("available_until", sa.DateTime(timezone=True), nullable=True),
}

SETTINGS_COLUMNS = {
    "route_stages_enabled": sa.Column(
        "route_stages_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
    ),
    "checkpoint_hours_enabled": sa.Column(
        "checkpoint_hours_enabled", sa.Boolean(), nullable=False, server_default=sa.true()
    ),
}


def upgrade() -> None:
    if not table_exists(STAGES_TABLE, SCHEMA):
        op.create_table(
            STAGES_TABLE,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "event_id",
                sa.Integer(),
                sa.ForeignKey(f"{SCHEMA}.rally_events.id", ondelete="CASCADE"),
                nullable=True,
                index=True,
            ),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("order", sa.Integer(), nullable=False),
            sa.Column("order_matters", sa.Boolean(), nullable=False, server_default=sa.true()),
            # NULL means "every post in this stage".
            sa.Column("required_count", sa.Integer(), nullable=True),
            sa.UniqueConstraint("event_id", "order", name="uq_route_stage_event_order"),
            schema=SCHEMA,
        )

    add_missing_columns(CHECKPOINTS_TABLE, CHECKPOINT_COLUMNS, SCHEMA)
    add_missing_columns(SETTINGS_TABLE, SETTINGS_COLUMNS, SCHEMA)

    # The FK is added separately: add_missing_columns only adds the column, and
    # a fresh database baselined via create_all already has both.
    existing_fks = {
        fk["name"]
        for fk in sa.inspect(op.get_bind()).get_foreign_keys(CHECKPOINTS_TABLE, schema=SCHEMA)
    }
    if "fk_checkpoints_stage_id" not in existing_fks:
        op.create_foreign_key(
            "fk_checkpoints_stage_id",
            CHECKPOINTS_TABLE,
            STAGES_TABLE,
            ["stage_id"],
            ["id"],
            source_schema=SCHEMA,
            referent_schema=SCHEMA,
            ondelete="SET NULL",
        )


def downgrade() -> None:
    drop_present_columns(SETTINGS_TABLE, SETTINGS_COLUMNS, SCHEMA)
    drop_present_columns(CHECKPOINTS_TABLE, CHECKPOINT_COLUMNS, SCHEMA)
    if table_exists(STAGES_TABLE, SCHEMA):
        op.drop_table(STAGES_TABLE, schema=SCHEMA)
