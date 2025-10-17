from sqlalchemy import Column, Integer, Boolean
from app.models.base import Base

class RallySettings(Base):
    __tablename__ = "rally_settings"

    id = Column(Integer, primary_key=True, default=1) # there's only 1 row
    max_teams = Column(Integer, nullable=False, default=16)
    enable_versus = Column(Boolean, nullable=False, default=False)