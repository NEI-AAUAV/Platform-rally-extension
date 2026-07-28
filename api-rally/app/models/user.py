from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base

if TYPE_CHECKING:
    from app.schemas.team_members import TeamMemberUpdate


class User(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # OIDC subject from authentik; how a login is matched to a local user.
    authentik_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str]
    email: Mapped[str | None] = mapped_column(String(255))
    scopes: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    team_id: Mapped[int | None] = mapped_column(ForeignKey(f"{settings.SCHEMA_NAME}.teams.id"))
    staff_checkpoint_id: Mapped[int | None] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id")
    )
    disabled: Mapped[bool] = mapped_column(default=False)
    is_captain: Mapped[bool] = mapped_column(default=False)

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
