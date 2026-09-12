"""teams.times: store visit timestamps as instants, not naive wall-clock

`teams.times` is the visit log a team sees on its route screen. It was a
TIMESTAMP WITHOUT TIME ZONE array, written by `TeamService.add_checkpoint` as
`datetime.now(UTC).replace(tzinfo=None)` — a UTC instant with its offset
thrown away. The API then served it with no `Z`, and a browser reads an
offset-less ISO string as *local* time, so a 14:00 check-in printed as 13:00
in Lisbon summer (WEST, UTC+1) and correctly in winter.

`checkpoint_arrival.arrived_at` has always been TIMESTAMPTZ, which is why the
guide panel and the participant screen disagreed about the same check-in.

Every existing value is UTC wall-clock, so the conversion says so explicitly
rather than depending on the session `TimeZone` a plain cast would use.

Revision ID: 0061
Revises: 0060
Create Date: 2026-09-10
"""

from collections.abc import Sequence

from alembic import op
from alembic.migration_utils import column_exists, table_exists
from app.core.config import settings

revision: str = "0061"
down_revision: str | None = "0060"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME


def upgrade() -> None:
    if not (table_exists("teams", SCHEMA) and column_exists("teams", "times", SCHEMA)):
        return
    # A plain cast reads naive values in the session's TimeZone, so pin it to
    # UTC for this transaction — that is what the old writer stored. A CASE
    # with a subquery would be the explicit alternative, but Postgres rejects
    # subqueries in a USING transform.
    op.execute("SET LOCAL TimeZone = 'UTC'")
    op.execute(
        f"ALTER TABLE {SCHEMA}.teams "
        "ALTER COLUMN times TYPE TIMESTAMPTZ[] USING times::timestamptz[]"
    )


def downgrade() -> None:
    if not (table_exists("teams", SCHEMA) and column_exists("teams", "times", SCHEMA)):
        return
    op.execute("SET LOCAL TimeZone = 'UTC'")
    op.execute(
        f"ALTER TABLE {SCHEMA}.teams ALTER COLUMN times TYPE TIMESTAMP[] USING times::timestamp[]"
    )
