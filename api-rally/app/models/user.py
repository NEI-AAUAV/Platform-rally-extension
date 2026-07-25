from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base


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
