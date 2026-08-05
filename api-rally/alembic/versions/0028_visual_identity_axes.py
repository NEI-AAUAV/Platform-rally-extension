"""add button_style and visual_presets settings

Adds the visual-identity axis fields on rally_settings: a ``button_style``
string ('plain' | 'blood') applied live and independent of the accent, and a
``visual_presets`` JSON array of saved named identity bundles the admin can
re-apply. Both are additive and default to a safe/empty value so existing rows
converge without a data migration.

Revision ID: 0028
Revises: 0027
Create Date: 2026-07-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0028"
down_revision: Union[str, None] = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "rally_settings"


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    columns = sa.inspect(bind).get_columns(TABLE, schema=SCHEMA)
    return {c["name"] for c in columns}


def upgrade() -> None:
    existing = _existing_columns()
    if "button_style" not in existing:
        op.add_column(
            TABLE,
            sa.Column(
                "button_style",
                sa.String(length=20),
                nullable=False,
                server_default="plain",
            ),
            schema=SCHEMA,
        )
    if "visual_presets" not in existing:
        op.add_column(
            TABLE,
            sa.Column(
                "visual_presets",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'"),
            ),
            schema=SCHEMA,
        )


def downgrade() -> None:
    existing = _existing_columns()
    for column in ("visual_presets", "button_style"):
        if column in existing:
            op.drop_column(TABLE, column, schema=SCHEMA)
