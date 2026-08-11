"""add rich clue media kinds to checkpoint_media

Checkpoint media only ever meant "photo" or "fun fact" — the real event
planning documents this app is modeled on also want a QR code (scan for a
riddle/challenge), a Spotify link (a song to listen to on site), or a plain
external link, attached to a post alongside photos, all in the same ordered
list.

Adds three new ``media_kind`` enum values (``qr``, ``spotify``, ``link``)
and three new nullable columns on ``checkpoint_media``:

- ``content_url``: the external URL for ``spotify``/``link`` — kept
  separate from ``image_url`` because it is never an R2-uploaded asset and
  must never be passed to the storage deleter.
- ``content_text``: the raw payload a ``qr`` row encodes.
- ``title``: a short optional label shown above a ``spotify``/``link`` card.

``caption``/``order`` stay shared across every kind, matching the existing
photo/fun_fact rows.

This is the first migration in this repo that adds values to an existing
Postgres enum type. On Postgres 12+, ``ALTER TYPE ... ADD VALUE`` is allowed
inside a transaction as long as the new value isn't *used* in that same
transaction — which this migration never does, so no special
non-transactional handling is needed here.

``downgrade()`` only drops the three new columns; Postgres cannot cheaply
remove enum values (would require rebuilding the type and every column that
uses it), so a downgrade leaves the three enum values in place — any row
still using them would otherwise be unrepresentable.

Revision ID: 0041
Revises: 0040
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from alembic.migration_utils import add_missing_columns, drop_present_columns
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "0041"
down_revision: str | None = "0040"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = settings.SCHEMA_NAME
TABLE = "checkpoint_media"
ENUM = "media_kind"
NEW_KINDS = ("qr", "spotify", "link")
COLUMNS = {
    "content_url": sa.Column("content_url", sa.String(length=500), nullable=True),
    "content_text": sa.Column("content_text", sa.Text(), nullable=True),
    "title": sa.Column("title", sa.String(length=200), nullable=True),
}


def upgrade() -> None:
    # `ALTER TYPE ... ADD VALUE` takes a string literal, not a bindable
    # parameter — safe to interpolate directly since NEW_KINDS is a fixed,
    # hardcoded tuple, never user input.
    for kind in NEW_KINDS:
        op.execute(f'ALTER TYPE "{SCHEMA}"."{ENUM}" ADD VALUE IF NOT EXISTS \'{kind}\'')
    add_missing_columns(TABLE, COLUMNS, SCHEMA)


def downgrade() -> None:
    drop_present_columns(TABLE, COLUMNS, SCHEMA)
