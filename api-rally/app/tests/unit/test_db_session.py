"""Unit tests for app.db.session helpers (`_engine_kwargs`, `check_db_health`).

`check_db_health` is exercised with a fake session/connection rather than the
real module-level `SessionLocal`/engine: those are created once at import
time bound to whichever event loop existed then, and asyncpg connections
can't cross event loops — reusing the real engine here breaks when this test
runs alongside many other async tests each getting their own loop. A fake
session/connection exercises the exact same code path deterministically.
"""
from unittest.mock import patch

import pytest
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db import session as session_module


def test_engine_kwargs_uses_nullpool_when_pool_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DB_DISABLE_POOL", True)

    kwargs = session_module._engine_kwargs()

    assert kwargs == {"poolclass": NullPool}


def test_engine_kwargs_uses_sized_pool_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DB_DISABLE_POOL", False)
    monkeypatch.setattr(settings, "DB_POOL_SIZE", 5)
    monkeypatch.setattr(settings, "DB_MAX_OVERFLOW", 10)
    monkeypatch.setattr(settings, "DB_POOL_RECYCLE_SECONDS", 300)

    kwargs = session_module._engine_kwargs()

    assert kwargs == {
        "pool_size": 5,
        "max_overflow": 10,
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }


async def test_check_db_health_returns_true_when_query_succeeds() -> None:
    class _WorkingSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def execute(self, *args, **kwargs):
            return None

    with patch.object(session_module, "SessionLocal", return_value=_WorkingSession()):
        result = await session_module.check_db_health()

    assert result is True


async def test_check_db_health_returns_false_on_sqlalchemy_error() -> None:
    class _BrokenSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def execute(self, *args, **kwargs):
            raise SQLAlchemyError("connection refused")

    with patch.object(session_module, "SessionLocal", return_value=_BrokenSession()):
        result = await session_module.check_db_health()

    assert result is False
