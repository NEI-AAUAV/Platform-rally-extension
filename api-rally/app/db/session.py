import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings

logger = logging.getLogger(__name__)


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


async def check_db_health() -> bool:
    """Return True when the database answers a trivial query, False otherwise.

    Mirrors ``check_redis_health`` in ``core/redis``: used by the readiness
    probe so a database outage is reported instead of surfacing as opaque 500s.
    """
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except SQLAlchemyError as exc:
        logger.warning("Database health check failed: %s", exc)
        return False
