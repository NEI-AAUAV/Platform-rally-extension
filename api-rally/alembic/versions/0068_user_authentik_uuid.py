"""user.authentik_uuid: Authentik account uuid recorded by admin links

Admin search returns the Authentik account ``uuid``, which differs from the
OIDC ``sub`` claim when the provider hashes subjects. Storing it in
``authentik_sub`` broke later logins (no sub match) and keyed participations
under an id the profile never queries. It now lives in its own column.

Revision ID: 0068
Revises: 0067
Create Date: 2026-11-13
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0068"
down_revision: str | None = "0067"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "user"
COLUMN = "authentik_uuid"
CONSTRAINT = "uq_user_authentik_uuid"


def upgrade() -> None:
    if not table_exists(TABLE, SCHEMA) or column_exists(TABLE, COLUMN, SCHEMA):
        return
    op.add_column(TABLE, sa.Column(COLUMN, sa.String(255), nullable=True), schema=SCHEMA)
    op.create_unique_constraint(CONSTRAINT, TABLE, [COLUMN], schema=SCHEMA)


def downgrade() -> None:
    if not table_exists(TABLE, SCHEMA) or not column_exists(TABLE, COLUMN, SCHEMA):
        return
    op.drop_constraint(CONSTRAINT, TABLE, schema=SCHEMA, type_="unique")
    op.drop_column(TABLE, COLUMN, schema=SCHEMA)
