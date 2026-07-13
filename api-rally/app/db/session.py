import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

logger = logging.getLogger(__name__)


def _async_url(uri: str) -> str:
    """Use the asyncpg driver for the async engine."""
    return uri.replace("postgresql://", "postgresql+asyncpg://", 1)


def _engine_kwargs() -> dict:
    """Build engine pool kwargs.

    Behind a transaction-pooling proxy (pgbouncer), SQLAlchemy's own pool
    conflicts with server-side pooling, so fall back to NullPool. Otherwise
    size the pool and enable pre-ping / recycle to survive stale connections.
    """
    if settings.DB_DISABLE_POOL:
        return {"poolclass": NullPool}
    return {
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_pre_ping": True,
        "pool_recycle": settings.DB_POOL_RECYCLE_SECONDS,
    }


engine = create_async_engine(
    _async_url(str(settings.POSTGRES_URI)),
    echo=not settings.PRODUCTION,  # Only echo SQL in development
    **_engine_kwargs(),
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
