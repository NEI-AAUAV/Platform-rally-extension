"""add background_style setting

Adds the background pattern axis on rally_settings: a ``background_style``
string ('plain' | 'dots' | 'grid' | 'glow' | 'stripes' | 'confetti' |
'halloween') for themed / seasonal editions. Additive; defaults to 'plain' so
existing rows converge without a data migration.

Revision ID: 0029
Revises: 0028
Create Date: 2026-07-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    columns = sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)
    return {c["name"] for c in columns}


def upgrade() -> None:
    if "background_style" not in _existing_columns():
        op.add_column(
            TABLE,
            sa.Column(
                "background_style",
                sa.String(length=20),
                nullable=False,
                server_default="plain",
            ),
            schema=SCHEMA,
        )


def downgrade() -> None:
    if "background_style" in _existing_columns():
        op.drop_column(TABLE, "background_style", schema=SCHEMA)
