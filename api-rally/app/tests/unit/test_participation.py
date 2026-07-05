"""Unit tests for participation recording (per-person event history)."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.crud.crud_participation import CRUDParticipation


def _mock_db() -> AsyncMock:
    db = AsyncMock()
    db.add = Mock()
    return db


def _team(**over) -> SimpleNamespace:
    base = {"id": 10, "name": "Os Bons", "total": 42, "classification": 2}
    base.update(over)
    return SimpleNamespace(**base)


async def test_record_creates_with_team_snapshot() -> None:
    crud = CRUDParticipation()
    db = _mock_db()
    # get_for_sub_and_event -> none existing
    db.scalars.return_value = SimpleNamespace(first=lambda: None)

    row = await crud.record(db, authentik_sub="sub-1", event_id=5, team=_team(), is_captain=True)

    assert row.authentik_sub == "sub-1"
    assert row.event_id == 5
    assert row.team_id == 10
    assert row.team_name == "Os Bons"
    assert row.team_total == 42
    assert row.team_classification == 2
    assert row.is_captain is True
    db.add.assert_called_once()
    db.commit.assert_awaited()


async def test_record_updates_existing_idempotent() -> None:
    crud = CRUDParticipation()
    db = _mock_db()
    existing = SimpleNamespace(
        authentik_sub="sub-1", event_id=5, team_id=None, team_name=None,
        team_total=None, team_classification=None, is_captain=False,
    )
    db.scalars.return_value = SimpleNamespace(first=lambda: existing)

    row = await crud.record(db, authentik_sub="sub-1", event_id=5, team=_team(total=99))

    # Same object, refreshed snapshot — not a new row.
    assert row is existing
    assert row.team_total == 99
    assert row.team_id == 10
    db.commit.assert_awaited()


async def test_record_without_team_leaves_nulls() -> None:
    crud = CRUDParticipation()
    db = _mock_db()
    db.scalars.return_value = SimpleNamespace(first=lambda: None)

    row = await crud.record(db, authentik_sub="sub-2", event_id=7, team=None)

    assert row.team_id is None
    assert row.team_name is None
    assert row.team_total is None
