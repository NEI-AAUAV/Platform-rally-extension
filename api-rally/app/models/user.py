from typing import Optional, List
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy.dialects.postgresql import ARRAY

from app.models.base import Base
from app.core.config import settings


class User(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]
    email: Mapped[Optional[str]] = mapped_column(String(255))
    password: Mapped[Optional[str]] = mapped_column(String(255))
    scopes: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String))
    team_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.teams.id")
    )
    staff_checkpoint_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(f"{settings.SCHEMA_NAME}.checkpoints.id")
    )
    disabled: Mapped[bool] = mapped_column(default=False)
    is_captain: Mapped[bool] = mapped_column(default=False)
