"""Database session factory for worker event handlers.

Worker handlers run inside a fresh event loop per event (``asyncio.run``), so
they cannot reuse the request-scoped engine, whose asyncpg pool is bound to the
main loop. Each handler builds a short-lived engine, does its work and disposes
it. Events are infrequent (one per scoring change), so the per-event cost is
negligible and correctness beats pooling here.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.session import _async_url


@asynccontextmanager
async def worker_session() -> AsyncIterator[AsyncSession]:
    """Yield an AsyncSession backed by a fresh, disposed-after engine."""
    engine = create_async_engine(_async_url(str(settings.POSTGRES_URI)), echo=False)
    session_maker = async_sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    try:
        async with session_maker() as session:
            yield session
    finally:
        await engine.dispose()
