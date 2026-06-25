"""Unit tests for the badge rule evaluators."""

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.badges import evaluators
from app.models.badge import BadgeType
from app.schemas.activity_types import ActivityType


def _vs_result(*, completed: bool = True, outcome: str = "win") -> Any:
    return SimpleNamespace(
        id=1,
        team_id=10,
        activity_id=99,
        is_completed=completed,
        result_data={"result": outcome, "opponent_team_id": 20},
        activity=SimpleNamespace(activity_type=ActivityType.TEAM_VS.value),
    )


async def test_head_to_head_awards_on_win() -> None:
    awards = await evaluators._evaluate_head_to_head_win(AsyncMock(), _vs_result())

    assert len(awards) == 1
    award = awards[0]
    assert award.badge_type == BadgeType.HEAD_TO_HEAD_WIN
    assert award.team_id == 10
    assert award.activity_id == 99
    assert award.meta["opponent_team_id"] == 20


async def test_head_to_head_skips_loss() -> None:
    awards = await evaluators._evaluate_head_to_head_win(
        AsyncMock(), _vs_result(outcome="lose")
    )
    assert awards == []


async def test_head_to_head_skips_incomplete() -> None:
    awards = await evaluators._evaluate_head_to_head_win(
        AsyncMock(), _vs_result(completed=False)
    )
    assert awards == []


async def test_head_to_head_skips_non_versus_activity() -> None:
    result = _vs_result()
    result.activity = SimpleNamespace(activity_type=ActivityType.TIME_BASED.value)
    awards = await evaluators._evaluate_head_to_head_win(AsyncMock(), result)
    assert awards == []


async def test_first_to_complete_awards_earliest_team(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.badge_service.badge_holder_exists",
        AsyncMock(return_value=False),
    )

    earliest = SimpleNamespace(
        team_id=7, activity_id=99, completed_at=SimpleNamespace(isoformat=lambda: "T0")
    )
    db = AsyncMock()
    scalars = MagicMock()
    scalars.first.return_value = earliest
    db.scalars.return_value = scalars

    triggering: Any = SimpleNamespace(
        id=2, team_id=8, activity_id=99, is_completed=True
    )
    awards = await evaluators._evaluate_first_to_complete(db, triggering)

    assert len(awards) == 1
    # Awarded to the actual first finisher, not whoever triggered the event.
    assert awards[0].team_id == 7
    assert awards[0].badge_type == BadgeType.FIRST_TO_COMPLETE_ACTIVITY


async def test_first_to_complete_skips_when_already_held(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.badge_service.badge_holder_exists",
        AsyncMock(return_value=True),
    )
    triggering: Any = SimpleNamespace(
        id=2, team_id=8, activity_id=99, is_completed=True
    )
    awards = await evaluators._evaluate_first_to_complete(AsyncMock(), triggering)
    assert awards == []


async def test_evaluate_result_collects_from_all_rules(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.badge_service.badge_holder_exists",
        AsyncMock(return_value=True),
    )
    # A winning versus result earns exactly the head-to-head badge.
    awards = await evaluators.evaluate_result(AsyncMock(), _vs_result())
    assert [a.badge_type for a in awards] == [BadgeType.HEAD_TO_HEAD_WIN]


async def test_evaluate_result_isolates_failing_rule(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def boom(db: object, result: object) -> list[object]:
        raise RuntimeError("rule exploded")

    monkeypatch.setattr(evaluators, "_EVALUATORS", [boom])
    # Failure is swallowed; no awards, no exception.
    assert await evaluators.evaluate_result(AsyncMock(), _vs_result()) == []
