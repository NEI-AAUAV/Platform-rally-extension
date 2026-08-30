"""users.email: partial unique index

users.email had no uniqueness constraint at all. Combined with the
email-match adoption path in ``_adopt_email_placeholder`` (deps.py) — now
also gated on the IdP's ``email_verified`` claim — an unconstrained column
still leaves the row-level invariant unenforced at the DB layer: nothing
stops two rows from ending up with the same email through any other write
path than the crud_user advisory-lock-guarded one.

A plain UNIQUE constraint cannot be used because ``email`` is nullable and
many rows (team-only/no-OIDC accounts) legitimately have no email — under a
plain constraint two NULLs would need special dialect handling, and a
partial index is the direct way to express "unique when present" on
Postgres. Uniqueness is case-sensitive on the stored value; if two existing
rows differ only by case, creating the index will fail — that's judged
correct here (surface the pre-existing dirty-data conflict rather than
silently pick a winner).

Revision ID: 0049
Revises: 0048
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from alembic.migration_utils import table_exists
from app.core.config import settings

revision: str = "0049"
down_revision: str | None = "0048"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
INDEX_NAME = "ix_users_email_unique"


def _index_exists() -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("users", schema=SCHEMA):
        return True  # nothing to do either way
    return any(ix["name"] == INDEX_NAME for ix in inspector.get_indexes("users", schema=SCHEMA))


def upgrade() -> None:
    if table_exists("users", SCHEMA) and not _index_exists():
        op.create_index(
            INDEX_NAME,
            "users",
            ["email"],
            unique=True,
            schema=SCHEMA,
            postgresql_where=sa.text("email IS NOT NULL"),
        )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="users", schema=SCHEMA)
