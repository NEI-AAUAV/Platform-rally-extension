"""event participation history

Adds the ``event_participation`` table that anchors a person's cross-edition
participation history on their OIDC identity (``authentik_sub``). The model
existed before this migration but had no DDL, so a fresh database never created
the table — this closes that gap.

Same existence-guard pattern as 0002: the 0001 baseline runs ``create_all`` over
the current models, so a brand-new database upgraded straight from base may
already have this table by the time 0003 runs, whereas a pre-existing database
baselined at 0001 (before the table existed) needs it created. The guard makes
both paths converge.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "event_participation"


def _table_exists() -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(TABLE, schema=SCHEMA)


def upgrade() -> None:
    if _table_exists():
        return
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("authentik_sub", sa.String(length=255), nullable=False, index=True),
        sa.Column(
            "event_id",
            sa.Integer(),
            sa.ForeignKey(f"{SCHEMA}.rally_events.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "team_id",
            sa.Integer(),
            sa.ForeignKey(f"{SCHEMA}.teams.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("team_name", sa.String(length=255), nullable=True),
        sa.Column("team_total", sa.Integer(), nullable=True),
        sa.Column("team_classification", sa.Integer(), nullable=True),
        sa.Column(
            "is_captain",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "authentik_sub", "event_id", name="uq_participation_person_event"
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    if not _table_exists():
        return
    op.drop_table(TABLE, schema=SCHEMA)
