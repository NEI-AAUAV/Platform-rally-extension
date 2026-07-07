"""Unit tests for the data-driven badge rule evaluators."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.badges import evaluators
from app.badges.triggers import BadgeTrigger
from app.schemas.activity_types import ActivityType


def _defn(
    *,
    code: str = "test_badge",
    trigger: BadgeTrigger = BadgeTrigger.WIN_ACTIVITY,
    criteria: dict[str, Any] | None = None,
    is_active: bool = True,
    is_auto: bool = True,
) -> Any:
    return SimpleNamespace(
        code=code,
        trigger_type=trigger.value,
        criteria=criteria or {},
        is_active=is_active,
        is_auto=is_auto,
    )


def _vs_result(*, completed: bool = True, outcome: str = "win") -> Any:
    return SimpleNamespace(
        id=1,
        team_id=10,
        activity_id=99,
        is_completed=completed,
        result_data={"result": outcome, "opponent_team_id": 20},
        activity=SimpleNamespace(
            activity_type=ActivityType.TEAM_VS.value, checkpoint_id=7
        ),
    )


# --- win_activity -----------------------------------------------------------


async def test_win_activity_awards_on_win() -> None:
    awards = await evaluators._handle_win_activity(AsyncMock(), _vs_result(), _defn())

    assert len(awards) == 1
    award = awards[0]
    assert award.badge_code == "test_badge"
    assert award.team_id == 10
    assert award.activity_id == 99
    assert award.meta["opponent_team_id"] == 20


async def test_win_activity_skips_loss() -> None:
    awards = await evaluators._handle_win_activity(
        AsyncMock(), _vs_result(outcome="lose"), _defn()
    )
    assert awards == []


async def test_win_activity_skips_incomplete() -> None:
    awards = await evaluators._handle_win_activity(
        AsyncMock(), _vs_result(completed=False), _defn()
    )
    assert awards == []


async def test_win_activity_skips_non_versus_activity() -> None:
    result = _vs_result()
    result.activity = SimpleNamespace(
        activity_type=ActivityType.TIME_BASED.value, checkpoint_id=7
    )
    awards = await evaluators._handle_win_activity(AsyncMock(), result, _defn())
    assert awards == []


async def test_win_activity_scoped_to_other_activity_skips() -> None:
    awards = await evaluators._handle_win_activity(
        AsyncMock(), _vs_result(), _defn(criteria={"activity_id": 1234})
    )
    assert awards == []


async def test_win_activity_scoped_to_matching_activity_fires() -> None:
    awards = await evaluators._handle_win_activity(
        AsyncMock(), _vs_result(), _defn(criteria={"activity_id": 99})
    )
    assert len(awards) == 1


# --- first_complete_activity ------------------------------------------------


async def test_first_complete_activity_awards_earliest_team(
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
    awards = await evaluators._handle_first_complete_activity(
        db, triggering, _defn(trigger=BadgeTrigger.FIRST_COMPLETE_ACTIVITY)
    )

    assert len(awards) == 1
    # Awarded to the actual first finisher, not whoever triggered the event.
    assert awards[0].team_id == 7
    assert awards[0].badge_code == "test_badge"


async def test_first_complete_activity_skips_when_already_held(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.badge_service.badge_holder_exists",
        AsyncMock(return_value=True),
    )
    triggering: Any = SimpleNamespace(
        id=2, team_id=8, activity_id=99, is_completed=True
    )
    awards = await evaluators._handle_first_complete_activity(
        AsyncMock(), triggering, _defn(trigger=BadgeTrigger.FIRST_COMPLETE_ACTIVITY)
    )
    assert awards == []


# --- first_complete_checkpoint ----------------------------------------------


def _checkpoint_result() -> Any:
    return SimpleNamespace(
        id=3,
        team_id=5,
        activity_id=1,
        is_completed=True,
        activity=SimpleNamespace(checkpoint_id=50),
    )


def _scalars(values: list[Any]) -> MagicMock:
    scalars = MagicMock()
    scalars.all.return_value = values
    return scalars


async def test_first_complete_checkpoint_awards_earliest_full_team(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.badge_service.badge_holder_exists",
        AsyncMock(return_value=False),
    )
    t1 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 1, 1, 12, 5, 0, tzinfo=timezone.utc)
    t3 = datetime(2026, 1, 1, 12, 9, 0, tzinfo=timezone.utc)

    # Checkpoint has activities {1, 2}. Team 5 finished both (last at t3);
    # team 6 finished only activity 1 -> not a finisher.
    completed = [
        SimpleNamespace(team_id=5, activity_id=1, completed_at=t1),
        SimpleNamespace(team_id=5, activity_id=2, completed_at=t3),
        SimpleNamespace(team_id=6, activity_id=1, completed_at=t2),
    ]
    db = AsyncMock()
    db.scalars.side_effect = [_scalars([1, 2]), _scalars(completed)]

    awards = await evaluators._handle_first_complete_checkpoint(
        db, _checkpoint_result(), _defn(trigger=BadgeTrigger.FIRST_COMPLETE_CHECKPOINT)
    )

    assert len(awards) == 1
    assert awards[0].team_id == 5
    assert awards[0].badge_code == "test_badge"
    assert awards[0].checkpoint_id == 50


async def test_first_complete_checkpoint_skips_when_held(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.badge_service.badge_holder_exists",
        AsyncMock(return_value=True),
    )
    awards = await evaluators._handle_first_complete_checkpoint(
        AsyncMock(),
        _checkpoint_result(),
        _defn(trigger=BadgeTrigger.FIRST_COMPLETE_CHECKPOINT),
    )
    assert awards == []


async def test_first_complete_checkpoint_skips_when_no_team_finished_all(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.badge_service.badge_holder_exists",
        AsyncMock(return_value=False),
    )
    t1 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    # Activities {1, 2} but only activity 1 has any completion.
    db = AsyncMock()
    db.scalars.side_effect = [
        _scalars([1, 2]),
        _scalars([SimpleNamespace(team_id=5, activity_id=1, completed_at=t1)]),
    ]
    awards = await evaluators._handle_first_complete_checkpoint(
        db, _checkpoint_result(), _defn(trigger=BadgeTrigger.FIRST_COMPLETE_CHECKPOINT)
    )
    assert awards == []


# --- complete_n_activities --------------------------------------------------


def _milestone_result(team_id: int = 10) -> Any:
    return SimpleNamespace(
        id=4, team_id=team_id, activity_id=99, is_completed=True
    )


async def test_complete_n_activities_awards_at_threshold() -> None:
    db = AsyncMock()
    db.scalars.return_value = _scalars([1, 2, 3])  # 3 distinct completed
    awards = await evaluators._handle_complete_n_activities(
        db,
        _milestone_result(),
        _defn(trigger=BadgeTrigger.COMPLETE_N_ACTIVITIES, criteria={"count": 3}),
    )
    assert len(awards) == 1
    assert awards[0].team_id == 10
    assert awards[0].meta["count"] == 3


async def test_complete_n_activities_skips_below_threshold() -> None:
    db = AsyncMock()
    db.scalars.return_value = _scalars([1, 2])  # only 2
    awards = await evaluators._handle_complete_n_activities(
        db,
        _milestone_result(),
        _defn(trigger=BadgeTrigger.COMPLETE_N_ACTIVITIES, criteria={"count": 3}),
    )
    assert awards == []


async def test_complete_n_activities_skips_missing_count() -> None:
    awards = await evaluators._handle_complete_n_activities(
        AsyncMock(),
        _milestone_result(),
        _defn(trigger=BadgeTrigger.COMPLETE_N_ACTIVITIES, criteria={}),
    )
    assert awards == []


async def test_complete_n_activities_skips_incomplete_result() -> None:
    result = _milestone_result()
    result.is_completed = False
    awards = await evaluators._handle_complete_n_activities(
        AsyncMock(),
        result,
        _defn(trigger=BadgeTrigger.COMPLETE_N_ACTIVITIES, criteria={"count": 1}),
    )
    assert awards == []


# --- complete_all_checkpoints -----------------------------------------------


async def test_complete_all_checkpoints_awards_when_all_covered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = AsyncMock()
    # First scalars call: all active activity ids. Second: team's completed subset.
    db.scalars.side_effect = [_scalars([1, 2, 3]), _scalars([1, 2, 3])]
    awards = await evaluators._handle_complete_all_checkpoints(
        db,
        _milestone_result(),
        _defn(trigger=BadgeTrigger.COMPLETE_ALL_CHECKPOINTS),
    )
    assert len(awards) == 1
    assert awards[0].meta["activities"] == 3


async def test_complete_all_checkpoints_skips_when_partial() -> None:
    db = AsyncMock()
    db.scalars.side_effect = [_scalars([1, 2, 3]), _scalars([1, 2])]  # missing 3
    awards = await evaluators._handle_complete_all_checkpoints(
        db,
        _milestone_result(),
        _defn(trigger=BadgeTrigger.COMPLETE_ALL_CHECKPOINTS),
    )
    assert awards == []


async def test_complete_all_checkpoints_single_holder_skips_when_held(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.badge_service.badge_holder_exists",
        AsyncMock(return_value=True),
    )
    awards = await evaluators._handle_complete_all_checkpoints(
        AsyncMock(),
        _milestone_result(),
        _defn(
            trigger=BadgeTrigger.COMPLETE_ALL_CHECKPOINTS,
            criteria={"single_holder": True},
        ),
    )
    assert awards == []


# --- score_threshold --------------------------------------------------------


async def test_score_threshold_awards_at_or_above() -> None:
    db = AsyncMock()
    db.scalar.return_value = 120.0
    awards = await evaluators._handle_score_threshold(
        db,
        _milestone_result(),
        _defn(trigger=BadgeTrigger.SCORE_THRESHOLD, criteria={"min_score": 100}),
    )
    assert len(awards) == 1
    assert awards[0].meta["total_score"] == pytest.approx(120.0)


async def test_score_threshold_skips_below() -> None:
    db = AsyncMock()
    db.scalar.return_value = 80.0
    awards = await evaluators._handle_score_threshold(
        db,
        _milestone_result(),
        _defn(trigger=BadgeTrigger.SCORE_THRESHOLD, criteria={"min_score": 100}),
    )
    assert awards == []


async def test_score_threshold_skips_missing_criterion() -> None:
    awards = await evaluators._handle_score_threshold(
        AsyncMock(),
        _milestone_result(),
        _defn(trigger=BadgeTrigger.SCORE_THRESHOLD, criteria={}),
    )
    assert awards == []


# --- fast_complete ----------------------------------------------------------


def _timed_result(*, seconds: float, team_id: int = 10, activity_id: int = 99) -> Any:
    start = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=5,
        team_id=team_id,
        activity_id=activity_id,
        is_completed=True,
        created_at=start,
        completed_at=start + timedelta(seconds=seconds),
    )


async def test_fast_complete_awards_within_limit() -> None:
    awards = await evaluators._handle_fast_complete(
        AsyncMock(),
        _timed_result(seconds=90),
        _defn(trigger=BadgeTrigger.FAST_COMPLETE, criteria={"max_seconds": 120}),
    )
    assert len(awards) == 1
    assert awards[0].activity_id == 99
    assert awards[0].meta["duration_seconds"] == pytest.approx(90.0)


async def test_fast_complete_skips_over_limit() -> None:
    awards = await evaluators._handle_fast_complete(
        AsyncMock(),
        _timed_result(seconds=200),
        _defn(trigger=BadgeTrigger.FAST_COMPLETE, criteria={"max_seconds": 120}),
    )
    assert awards == []


async def test_fast_complete_scoped_to_other_activity_skips() -> None:
    awards = await evaluators._handle_fast_complete(
        AsyncMock(),
        _timed_result(seconds=10, activity_id=99),
        _defn(
            trigger=BadgeTrigger.FAST_COMPLETE,
            criteria={"max_seconds": 120, "activity_id": 1234},
        ),
    )
    assert awards == []


async def test_fast_complete_single_holder_skips_when_held(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.badge_service.badge_holder_exists",
        AsyncMock(return_value=True),
    )
    awards = await evaluators._handle_fast_complete(
        AsyncMock(),
        _timed_result(seconds=10),
        _defn(
            trigger=BadgeTrigger.FAST_COMPLETE,
            criteria={"max_seconds": 120, "single_holder": True},
        ),
    )
    assert awards == []


# --- engine (evaluate_result) -----------------------------------------------


async def test_evaluate_result_runs_configured_rule(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        evaluators,
        "_load_auto_definitions",
        AsyncMock(return_value=[_defn(code="duel", trigger=BadgeTrigger.WIN_ACTIVITY)]),
    )
    awards = await evaluators.evaluate_result(AsyncMock(), _vs_result())
    assert [a.badge_code for a in awards] == ["duel"]


async def test_evaluate_result_ignores_non_auto_and_inactive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # _load_auto_definitions already filters is_active/is_auto in SQL; verify the
    # engine simply runs whatever it returns and returns [] when it returns none.
    monkeypatch.setattr(
        evaluators,
        "_load_auto_definitions",
        AsyncMock(return_value=[]),
    )
    assert await evaluators.evaluate_result(AsyncMock(), _vs_result()) == []


async def test_evaluate_result_isolates_failing_rule(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    boom = AsyncMock(side_effect=RuntimeError("rule exploded"))

    monkeypatch.setattr(
        evaluators,
        "_load_auto_definitions",
        AsyncMock(return_value=[_defn(trigger=BadgeTrigger.WIN_ACTIVITY)]),
    )
    monkeypatch.setitem(evaluators._TRIGGER_HANDLERS, BadgeTrigger.WIN_ACTIVITY, boom)
    # Failure is swallowed; no awards, no exception.
    assert await evaluators.evaluate_result(AsyncMock(), _vs_result()) == []


async def test_evaluate_result_skips_unknown_trigger(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bad = SimpleNamespace(code="x", trigger_type="not_a_trigger", criteria={})
    monkeypatch.setattr(
        evaluators, "_load_auto_definitions", AsyncMock(return_value=[bad])
    )
    assert await evaluators.evaluate_result(AsyncMock(), _vs_result()) == []
