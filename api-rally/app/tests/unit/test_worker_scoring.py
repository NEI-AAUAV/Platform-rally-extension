"""Unit tests for the scoring worker and the off-path recompute gate."""

from contextlib import asynccontextmanager
from typing import Any

import pytest

from app.events.channels import Channels
from app.services.scoring_service import ScoringService
from app.workers.worker_scoring import ScoringWorker


@asynccontextmanager
async def _fake_session():
    yield object()  # ScoringService is stubbed, so the session is never used


class _SpyScoringService:
    """Records the recompute primitives the worker invokes."""

    calls: list[tuple[str, Any]] = []

    def __init__(self, _session: Any) -> None:
        pass

    async def _recalculate_all_results_for_activity(self, activity_id: int) -> None:
        _SpyScoringService.calls.append(("recalc", activity_id))

    async def update_team_scores(self, team_id: int) -> None:
        _SpyScoringService.calls.append(("team", team_id))


@pytest.fixture(autouse=True)
def _reset_spy() -> None:
    _SpyScoringService.calls = []


async def test_handle_event_recomputes_activity_and_team(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.workers.worker_scoring.worker_session", _fake_session)
    monkeypatch.setattr("app.workers.worker_scoring.ScoringService", _SpyScoringService)

    worker = ScoringWorker()
    await worker.handle_event(
        Channels.ACTIVITY_RESULT_CREATED,
        {
            "event_type": "activity_result.created",
            "payload": {"result_id": 5, "team_id": 3, "activity_id": 7},
        },
    )

    assert ("recalc", 7) in _SpyScoringService.calls
    assert ("team", 3) in _SpyScoringService.calls


async def test_handle_event_ignores_payload_without_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.workers.worker_scoring.worker_session", _fake_session)
    monkeypatch.setattr("app.workers.worker_scoring.ScoringService", _SpyScoringService)

    worker = ScoringWorker()
    await worker.handle_event(
        Channels.ACTIVITY_RESULT_DELETED,
        {"event_type": "activity_result.deleted", "payload": {}},
    )

    assert _SpyScoringService.calls == []


def test_worker_subscribes_to_activity_result_pattern() -> None:
    assert Channels.ALL_ACTIVITY_RESULT_EVENTS in ScoringWorker().patterns


@pytest.mark.parametrize(
    "off_path, events_enabled, expected",
    [
        (True, True, True),
        (True, False, False),  # no worker would catch up → must stay inline
        (False, True, False),
        (False, False, False),
    ],
)
def test_defer_recompute_gate(
    monkeypatch: pytest.MonkeyPatch,
    off_path: bool,
    events_enabled: bool,
    expected: bool,
) -> None:
    monkeypatch.setattr(
        "app.services.scoring_service.settings.RECOMPUTE_OFF_PATH", off_path
    )
    monkeypatch.setattr(
        "app.services.scoring_service.settings.EVENTS_ENABLED", events_enabled
    )
    service = ScoringService(db=object())  # property reads settings, not the db
    assert service._defer_recompute is expected
