"""badge_definitions catalogue + seed

Creates ``badge_definitions`` table and seeds the 3 hardcoded BadgeType codes
so existing TeamBadge rows remain valid.

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "badge_definitions"

SEED = [
    {
        "code": "head_to_head_win",
        "name": "Cabeça a Cabeça",
        "description": "Ganhou um duelo direto contra outra equipa.",
        "is_auto": True,
        "is_active": True,
    },
    {
        "code": "first_to_complete_activity",
        "name": "Primeiro a Completar",
        "description": "Primeira equipa a concluir uma atividade.",
        "is_auto": True,
        "is_active": True,
    },
    {
        "code": "first_to_complete_checkpoint",
        "name": "Primeiro no Posto",
        "description": "Primeira equipa a completar todas as atividades de um posto.",
        "is_auto": True,
        "is_active": True,
    },
]


def _table_exists() -> bool:
    return sa.inspect(op.get_bind()).has_table(TABLE, schema=SCHEMA)


def upgrade() -> None:
    if not _table_exists():
        op.create_table(
            TABLE,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("code", sa.String(64), nullable=False),
            sa.Column("name", sa.String(128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("icon_url", sa.String(500), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("is_auto", sa.Boolean(), nullable=False, server_default="false"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("code", name="uq_badge_definition_code"),
            schema=SCHEMA,
        )
        op.create_index("ix_badge_definitions_code", TABLE, ["code"], schema=SCHEMA)

    # Seed hardcoded codes (idempotent: skip if code exists)
    bind = op.get_bind()
    for row in SEED:
        existing = bind.execute(
            sa.text(f"SELECT 1 FROM {SCHEMA}.{TABLE} WHERE code = :code"),
            {"code": row["code"]},
        ).fetchone()
        if not existing:
            bind.execute(
                sa.text(
                    f"INSERT INTO {SCHEMA}.{TABLE} (code, name, description, is_auto, is_active) "
                    "VALUES (:code, :name, :description, :is_auto, :is_active)"
                ),
                row,
            )


def downgrade() -> None:
    if _table_exists():
        op.drop_index("ix_badge_definitions_code", table_name=TABLE, schema=SCHEMA)
        op.drop_table(TABLE, schema=SCHEMA)
