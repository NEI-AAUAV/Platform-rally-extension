from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings


def _async_url(uri: str) -> str:
    """Use the asyncpg driver for the async engine."""
    return uri.replace("postgresql://", "postgresql+asyncpg://", 1)


engine = create_async_engine(
    _async_url(str(settings.POSTGRES_URI)),
    echo=not settings.PRODUCTION,  # Only echo SQL in development
)
SessionLocal = async_sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)
