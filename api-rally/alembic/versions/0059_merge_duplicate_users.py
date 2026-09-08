"""Merge duplicate user rows by email and enforce the constraint for real.

Two independent defects produced two rows for one person:

1. Staff are pre-provisioned from the Authentik management API and matched by
   email (``crud_user.get_or_create_mirror``), leaving ``authentik_sub`` NULL.
   The login path adopts that placeholder only when the token carries
   ``email_verified: true``; Authentik omits that claim unless the provider's
   scope mapping emits it, so first login inserted a second row instead.
2. ``0049_users_email_unique`` created its partial unique index against a table
   named ``users``, but ``Base.__tablename__`` derives ``User`` -> ``user``.
   Its ``table_exists("users")`` guard made the whole migration a silent no-op,
   so nothing at the database level ever rejected the duplicate.

``rally_staff_assignment.user_id`` and ``rally_guide_assignment.user_id`` are
deliberately not foreign keys, so the duplicate did not merely double a listing
row: the checkpoint assignment stayed on the placeholder and the row the person
actually logs in as appeared unassigned.

This migration collapses each email group onto one survivor -- preferring the
row that already carries an ``authentik_sub`` -- moves that person's
assignments and push subscriptions onto it, drops the losers, and finally
creates the unique index on the correct table.

The statements themselves live in ``app.db.duplicate_users`` so the test suite
can run this merge against a real schema; a destructive one-way migration is
not something to ship unverified.

The merge is NOT reversible: ``downgrade`` only drops the index.

Revision ID: 0059
Revises: 0058
Create Date: 2026-09-08
"""

from collections.abc import Sequence

from alembic import op
from alembic.migration_utils import table_exists
from app.core.config import settings
from app.db import duplicate_users as dup

revision: str = "0059"
down_revision: str | None = "0058"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME


def upgrade() -> None:
    if not table_exists("user", SCHEMA):
        return

    op.execute(dup.normalize_emails_sql(SCHEMA))
    op.execute(dup.build_dup_map_sql(SCHEMA))
    op.execute(dup.merge_fields_sql(SCHEMA))
    op.execute(dup.release_loser_subs_sql(SCHEMA))

    for table, other_column in dup.ASSIGNMENT_TABLES:
        if not table_exists(table, SCHEMA):
            continue
        op.execute(dup.repoint_assignment_sql(SCHEMA, table, other_column))
        op.execute(dup.drop_leftover_assignment_sql(SCHEMA, table))

    if table_exists("push_subscriptions", SCHEMA):
        op.execute(dup.repoint_push_subscriptions_sql(SCHEMA))

    op.execute(dup.delete_losers_sql(SCHEMA))
    op.execute(dup.create_unique_email_index_sql(SCHEMA))


def downgrade() -> None:
    # Only the index is reversible; merged rows are gone for good.
    op.execute(dup.drop_unique_email_index_sql(SCHEMA))
