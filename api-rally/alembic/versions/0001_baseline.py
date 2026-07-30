"""baseline: full current schema

Adopts the schema that the legacy ``create_all`` bootstrap produced as the
alembic baseline. Built from ``Base.metadata`` so it stays in lock-step with the
models at the point alembic was introduced. Subsequent migrations are explicit
(``op.add_column`` etc.) — that is the whole point of adopting alembic, since
``create_all`` never adds columns to existing tables.

On a database already created by ``create_all``, run ``alembic stamp head`` once
instead of ``upgrade`` so these tables are not recreated.

Revision ID: 0001
Revises:
Create Date: 2026-06-28
"""
from typing import Sequence, Union

from alembic import op

from app.models.base import Base

# Import every model so Base.metadata is complete before create_all.
from app.models import (  # noqa: F401
    User,
    Team,
    CheckPoint,
    RallyStaffAssignment,
    Activity,
    ActivityResult,
    RallyEvent,
    RallySettings,
    TeamBadge,
    EventParticipation,
)

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, checkfirst=True)
