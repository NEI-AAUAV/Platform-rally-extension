"""badge criteria/display columns + team_badges table

1. Adds color/glyph/trigger_type/criteria columns to ``badge_definitions``.
2. Backfills ``trigger_type`` on the 3 seeded badges so their auto-award rules
   keep firing under the new data-driven engine.
3. Creates ``team_badges`` if it is missing — it was previously only created by
   ``Base.metadata.create_all`` and had no migration, a schema-drift risk.

All operations are guarded because ``create_all`` may already have created these
tables/columns on live installs; unguarded add_column/create_table would crash.

Revision ID: 0017
Revises: 0016
Create Date: 2026-07-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.badges.triggers import LEGACY_CODE_TO_TRIGGER
from app.core.config import settings
from app.models.badge_definition import DEFAULT_BADGE_COLOR

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
DEF_TABLE = "badge_definitions"
BADGE_TABLE = "team_badges"

NEW_COLUMNS = {
    "color": lambda: sa.Column(
        "color", sa.String(9), nullable=False, server_default=DEFAULT_BADGE_COLOR
    ),
    "glyph": lambda: sa.Column("glyph", sa.String(8), nullable=True),
    "trigger_type": lambda: sa.Column("trigger_type", sa.String(48), nullable=True),
    "criteria": lambda: sa.Column(
        "criteria", sa.JSON(), nullable=False, server_default=sa.text("'{}'")
    ),
}


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table, schema=SCHEMA)}


def _has_table(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table, schema=SCHEMA)


def upgrade() -> None:
    bind = op.get_bind()

    # 1. add new definition columns
    if _has_table(DEF_TABLE):
        existing = _columns(DEF_TABLE)
        for name, make in NEW_COLUMNS.items():
            if name not in existing:
                op.add_column(DEF_TABLE, make(), schema=SCHEMA)

        # 2. backfill trigger_type on the seeded rows (idempotent)
        for code, trigger in LEGACY_CODE_TO_TRIGGER.items():
            bind.execute(
                sa.text(
                    f"UPDATE {SCHEMA}.{DEF_TABLE} SET trigger_type = :trigger "
                    "WHERE code = :code AND trigger_type IS NULL"
                ),
                {"trigger": trigger.value, "code": code},
            )

    # 3. create team_badges if missing
    if not _has_table(BADGE_TABLE):
        op.create_table(
            BADGE_TABLE,
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("team_id", sa.Integer(), nullable=False),
            sa.Column("badge_type", sa.String(64), nullable=False),
            sa.Column("activity_id", sa.Integer(), nullable=True),
            sa.Column("checkpoint_id", sa.Integer(), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("awarded_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(
                ["team_id"], [f"{SCHEMA}.teams.id"], ondelete="CASCADE"
            ),
            sa.UniqueConstraint(
                "team_id",
                "badge_type",
                "activity_id",
                "checkpoint_id",
                name="uq_team_badge_scope",
            ),
            schema=SCHEMA,
        )
        op.create_index(
            "ix_team_badges_team_id", BADGE_TABLE, ["team_id"], schema=SCHEMA
        )
        op.create_index(
            "ix_team_badges_badge_type", BADGE_TABLE, ["badge_type"], schema=SCHEMA
        )
        op.create_index(
            "ix_team_badges_activity_id", BADGE_TABLE, ["activity_id"], schema=SCHEMA
        )
        op.create_index(
            "ix_team_badges_checkpoint_id",
            BADGE_TABLE,
            ["checkpoint_id"],
            schema=SCHEMA,
        )


def downgrade() -> None:
    if _has_table(DEF_TABLE):
        existing = _columns(DEF_TABLE)
        for name in NEW_COLUMNS:
            if name in existing:
                op.drop_column(DEF_TABLE, name, schema=SCHEMA)
    # team_badges is left in place: it predates this migration (created by
    # create_all) so dropping it here would remove data this migration did not own.
