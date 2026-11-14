from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base

if TYPE_CHECKING:
    from app.schemas.team_members import TeamMemberUpdate


class User(Base):
    # One row per person. Both provisioning paths key on email — the Authentik
    # group mirror matches on it, and first login adopts the mirrored row by it
    # — so without this index a missed match silently became a second account,
    # stranding that person's checkpoint assignment on the older row.
    # Partial: placeholder members created by an admin have no email at all.
    __table_args__ = (
        Index(
            "ix_user_email_unique",
            "email",
            unique=True,
            postgresql_where=text("email IS NOT NULL"),
        ),
        UniqueConstraint("authentik_uuid", name="uq_user_authentik_uuid"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # OIDC subject from authentik; how a login is matched to a local user.
    authentik_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    # Authentik account uuid (what the management API / admin search exposes).
    # Not the same value as ``authentik_sub`` when the provider hashes the
    # subject, so an admin link records it here and leaves ``authentik_sub``
    # for the first login to fill in.
    authentik_uuid: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str]
    email: Mapped[str | None] = mapped_column(String(255))
    scopes: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    team_id: Mapped[int | None] = mapped_column(ForeignKey(f"{settings.SCHEMA_NAME}.teams.id"))
    staff_checkpoint_id: Mapped[int | None] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id")
    )
    disabled: Mapped[bool] = mapped_column(default=False)
    is_captain: Mapped[bool] = mapped_column(default=False)

    @property
    def is_linked(self) -> bool:
        """Bound to a real NEI account, whether or not it has logged in yet."""
        return self.authentik_sub is not None or self.authentik_uuid is not None

    def apply_update(self, update: "TeamMemberUpdate") -> None:
        """Patch only the fields present in the update payload."""
        if update.name is not None:
            self.name = update.name
        if update.email is not None:
            self.email = update.email
        if update.is_captain is not None:
            self.is_captain = update.is_captain

    def leave_team(self) -> None:
        """Remove this user's team membership."""
        self.team_id = None

    def link_to_team(self, *, team_id: int | None, is_captain: bool) -> None:
        """Take over a placeholder's team slot and captaincy."""
        self.team_id = team_id
        self.is_captain = is_captain
