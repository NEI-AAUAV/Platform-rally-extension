"""Unit tests for the BadgesWorker orchestration."""

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any, AsyncIterator
from unittest.mock import AsyncMock

import pytest

from app.badges.evaluators import BadgeAward
from app.workers import worker_badges
from app.workers.worker_badges import BadgesWorker


def _patch_session(monkeypatch: pytest.MonkeyPatch, *, badges_enabled: bool = True) -> None:
    @asynccontextmanager
    async def fake_session() -> AsyncIterator[Any]:
        yield AsyncMock()

    monkeypatch.setattr(worker_badges, "worker_session", fake_session)
    monkeypatch.setattr(
        worker_badges.rally_settings,
        "get_or_create",
        AsyncMock(return_value=SimpleNamespace(badges_enabled=badges_enabled)),
    )


def _created_event(result_id: int = 5) -> dict[str, Any]:
    return {"event_type": "activity_result.created", "payload": {"result_id": result_id}}


async def test_awards_and_publishes(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_session(monkeypatch)
    result = SimpleNamespace(id=5, team_id=10, activity_id=99)
    monkeypatch.setattr(
        BadgesWorker, "_load_result", AsyncMock(return_value=result)
    )
    award = BadgeAward(
        team_id=10, badge_code="head_to_head_win", activity_id=99
    )
    monkeypatch.setattr(
        worker_badges, "evaluate_result", AsyncMock(return_value=[award])
    )
    monkeypatch.setattr(
        "app.services.badge_service.award_badge",
        AsyncMock(return_value=SimpleNamespace(id=1)),
    )
    published = []
    monkeypatch.setattr(
        worker_badges,
        "publish_event",
        AsyncMock(side_effect=lambda e: published.append(e)),
    )

    await BadgesWorker().handle_event("rally.activity_result.created", _created_event())

    assert len(published) == 1
    assert published[0].payload.team_id == 10
    assert published[0].payload.badge_type == "head_to_head_win"


async def test_no_publish_when_already_held(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_session(monkeypatch)
    monkeypatch.setattr(
        BadgesWorker, "_load_result", AsyncMock(return_value=SimpleNamespace())
    )
    monkeypatch.setattr(
        worker_badges,
        "evaluate_result",
        AsyncMock(
            return_value=[
                BadgeAward(team_id=1, badge_code="head_to_head_win")
            ]
        ),
    )
    # award_badge returns None => badge already held.
    monkeypatch.setattr(
        "app.services.badge_service.award_badge", AsyncMock(return_value=None)
    )
    published = []
    monkeypatch.setattr(
        worker_badges,
        "publish_event",
        AsyncMock(side_effect=lambda e: published.append(e)),
    )

    await BadgesWorker().handle_event("rally.activity_result.created", _created_event())
    assert published == []


async def test_no_award_when_badges_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_session(monkeypatch, badges_enabled=False)
    load = AsyncMock()
    monkeypatch.setattr(BadgesWorker, "_load_result", load)
    evaluate = AsyncMock()
    monkeypatch.setattr(worker_badges, "evaluate_result", evaluate)

    await BadgesWorker().handle_event("rally.activity_result.created", _created_event())

    # Kill-switch off: the worker never even loads the result or evaluates rules.
    load.assert_not_called()
    evaluate.assert_not_called()


async def test_deletion_event_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    load = AsyncMock()
    monkeypatch.setattr(BadgesWorker, "_load_result", load)

    await BadgesWorker().handle_event(
        "rally.activity_result.deleted",
        {"event_type": "activity_result.deleted", "payload": {"result_id": 5}},
    )
    # Badges are permanent: a deletion never loads or awards anything.
    load.assert_not_called()


async def test_missing_result_id_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    """A created/updated event with no `result_id` in its payload is a no-op —
    nothing to look up or evaluate."""
    _patch_session(monkeypatch)
    load = AsyncMock()
    monkeypatch.setattr(BadgesWorker, "_load_result", load)

    await BadgesWorker().handle_event(
        "rally.activity_result.created",
        {"event_type": "activity_result.created", "payload": {}},
    )

    load.assert_not_called()


async def test_result_vanished_before_handling_is_ignored(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The result committed then got deleted before the worker processed the
    event: `_load_result` returning None is a no-op, not an error."""
    _patch_session(monkeypatch)
    monkeypatch.setattr(BadgesWorker, "_load_result", AsyncMock(return_value=None))
    evaluate = AsyncMock()
    monkeypatch.setattr(worker_badges, "evaluate_result", evaluate)

    await BadgesWorker().handle_event("rally.activity_result.created", _created_event())

    evaluate.assert_not_called()


async def test_load_result_queries_by_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Exercise the real `_load_result` query building (not mocked out)."""
    from unittest.mock import MagicMock

    fake_result = SimpleNamespace(id=5)

    class _FakeScalars:
        def first(self):
            return fake_result

    session = AsyncMock()
    session.scalars = AsyncMock(return_value=_FakeScalars())

    worker = BadgesWorker()
    loaded = await worker._load_result(session, 5)

    assert loaded is fake_result
    session.scalars.assert_called_once()
