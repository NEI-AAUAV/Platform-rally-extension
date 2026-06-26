"""Unit tests for the multi-event (edition) foundation.

Covers the RallyEvent CRUD invariants (single current event, lazy bootstrap,
slugging) and the per-event settings resolver. The suite is mock-based — the
ORM uses Postgres-only column types, so these exercise control flow against an
AsyncMock session rather than a real schema.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.crud.crud_activity import CRUDRallyEvent, _slugify
from app.models.activity import EventType


def _mock_db() -> AsyncMock:
    """AsyncMock session whose sync .add is a plain Mock (no await warning)."""
    db = AsyncMock()
    db.add = Mock()
    return db


# ---------------------------------------------------------------------------
# _slugify
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "value,expected",
    [
        ("Rally Tascas", "rally-tascas"),
        ("Peddy Paper 2026!", "peddy-paper-2026"),
        ("  Spaces  ", "spaces"),
        ("***", "event"),
        ("", "event"),
    ],
)
def test_slugify(value: str, expected: str) -> None:
    assert _slugify(value) == expected


# ---------------------------------------------------------------------------
# set_current
# ---------------------------------------------------------------------------

async def test_set_current_missing_event_returns_none() -> None:
    crud = CRUDRallyEvent()
    db = _mock_db()
    db.get.return_value = None

    result = await crud.set_current(db, event_id=42)

    assert result is None
    db.commit.assert_not_called()


async def test_set_current_demotes_others_and_promotes_target() -> None:
    crud = CRUDRallyEvent()
    target = SimpleNamespace(id=2, is_current=False)
    previous = SimpleNamespace(id=1, is_current=True)

    db = _mock_db()
    db.get.return_value = target
    # _demote_all iterates the currently-current events.
    db.scalars.return_value = SimpleNamespace(all=lambda: [previous])

    result = await crud.set_current(db, event_id=2)

    assert result is target
    assert target.is_current is True
    assert previous.is_current is False
    db.commit.assert_awaited()


# ---------------------------------------------------------------------------
# ensure_current
# ---------------------------------------------------------------------------

async def test_ensure_current_returns_existing_without_creating() -> None:
    crud = CRUDRallyEvent()
    existing = SimpleNamespace(id=7, is_current=True)

    db = _mock_db()
    # get_current() -> first() of the is_current query.
    db.scalars.return_value = SimpleNamespace(first=lambda: existing)

    result = await crud.ensure_current(db)

    assert result is existing
    db.add.assert_not_called()
    db.commit.assert_not_called()


async def test_ensure_current_adopts_existing_non_current() -> None:
    crud = CRUDRallyEvent()
    orphan = SimpleNamespace(id=3, is_current=False)

    db = _mock_db()
    # 1st scalars(): get_current -> None; 2nd scalars(): first existing event.
    db.scalars.side_effect = [
        SimpleNamespace(first=lambda: None),
        SimpleNamespace(first=lambda: orphan),
    ]

    result = await crud.ensure_current(db)

    assert result is orphan
    assert orphan.is_current is True
    db.commit.assert_awaited()


async def test_ensure_current_creates_default_when_empty() -> None:
    crud = CRUDRallyEvent()
    db = _mock_db()
    # get_current -> None; adopt query -> None; unique-slug check -> None.
    db.scalars.side_effect = [
        SimpleNamespace(first=lambda: None),
        SimpleNamespace(first=lambda: None),
    ]
    db.scalar.return_value = None  # _unique_slug: slug is free

    result = await crud.ensure_current(db)

    assert result.is_current is True
    assert result.event_type == EventType.RALLY_TASCAS.value
    assert result.slug == "rally-tascas"
    db.add.assert_called_once()
    db.commit.assert_awaited()
