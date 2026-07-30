"""checkpoint geofence — arrival_radius_m + checkpoint_arrivals table

Adds ``checkpoints.arrival_radius_m`` (default 50m) and the
``checkpoint_arrivals`` table recording GPS check-ins per team/checkpoint.

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    cols = [c["name"] for c in sa.inspect(bind).get_columns(table, schema=SCHEMA)]
    return column in cols


def _table_exists(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table, schema=SCHEMA)


def upgrade() -> None:
    if not _column_exists("checkpoints", "arrival_radius_m"):
        op.add_column(
            "checkpoints",
            sa.Column("arrival_radius_m", sa.Integer(), nullable=False, server_default="50"),
            schema=SCHEMA,
        )

    if not _table_exists("checkpoint_arrivals"):
        op.create_table(
            "checkpoint_arrivals",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("team_id", sa.Integer(), nullable=False),
            sa.Column("checkpoint_id", sa.Integer(), nullable=False),
            sa.Column(
                "arrived_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
            sa.ForeignKeyConstraint(["team_id"], [f"{SCHEMA}.teams.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["checkpoint_id"], [f"{SCHEMA}.checkpoints.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("team_id", "checkpoint_id", name="uq_arrival_team_checkpoint"),
            schema=SCHEMA,
        )
        op.create_index("ix_checkpoint_arrivals_team_id", "checkpoint_arrivals", ["team_id"], schema=SCHEMA)
        op.create_index("ix_checkpoint_arrivals_checkpoint_id", "checkpoint_arrivals", ["checkpoint_id"], schema=SCHEMA)


def downgrade() -> None:
    if _table_exists("checkpoint_arrivals"):
        op.drop_index("ix_checkpoint_arrivals_checkpoint_id", table_name="checkpoint_arrivals", schema=SCHEMA)
        op.drop_index("ix_checkpoint_arrivals_team_id", table_name="checkpoint_arrivals", schema=SCHEMA)
        op.drop_table("checkpoint_arrivals", schema=SCHEMA)

    if _column_exists("checkpoints", "arrival_radius_m"):
        op.drop_column("checkpoints", "arrival_radius_m", schema=SCHEMA)
