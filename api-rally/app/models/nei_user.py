from typing import Optional, List
from sqlalchemy import String, DateTime, Date, Integer
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy.dialects.postgresql import ARRAY

from app.models.base import Base


class NEIUser(Base):
    """
    Reference to NEI platform users.
    This model points to the main NEI user table (nei.user).
    """
    __tablename__ = "user"
    __table_args__ = {"schema": "nei"}  # NEI uses nei schema
    
    id: Mapped[int] = mapped_column(primary_key=True)
    iupi: Mapped[Optional[str]] = mapped_column(String(36))
    nmec: Mapped[Optional[int]] = mapped_column(Integer)
    hashed_password: Mapped[Optional[str]] = mapped_column(String)
    name: Mapped[str] = mapped_column(String(20))
    surname: Mapped[str] = mapped_column(String(20))
    gender: Mapped[Optional[str]] = mapped_column(String)  # gender_enum
    image: Mapped[Optional[str]] = mapped_column(String(2048))
    curriculum: Mapped[Optional[str]] = mapped_column(String(2048))
    linkedin: Mapped[Optional[str]] = mapped_column(String(2048))
    github: Mapped[Optional[str]] = mapped_column(String(2048))
    scopes: Mapped[List[str]] = mapped_column(ARRAY(String))
    updated_at: Mapped[str] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime)
    birthday: Mapped[Optional[str]] = mapped_column(Date)
    for_event: Mapped[Optional[int]] = mapped_column(Integer)
