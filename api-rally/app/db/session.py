from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


engine = create_engine(
    str(settings.POSTGRES_URI),
    echo=not settings.PRODUCTION  # Only echo SQL in development
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
