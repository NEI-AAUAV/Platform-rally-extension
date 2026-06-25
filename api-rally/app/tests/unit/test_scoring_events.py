"""Unit test: update_team_scores publishes a TeamScoreUpdated event."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.events import EventType
from app.services.scoring_service import ScoringService


def _mock_db_with_team() -> AsyncMock:
    db = AsyncMock()
    # A team with no checkpoints/results: total resolves to 0, no array work.
    db.get.return_value = SimpleNamespace(
        id=5, total=0, score_per_checkpoint=[], times=[]
    )
    scalars_result = MagicMock()
    scalars_result.all.return_value = []
    db.scalars.return_value = scalars_result
    db.commit = AsyncMock()
    return db


async def test_update_team_scores_publishes_event(monkeypatch: pytest.MonkeyPatch) -> None:
    published = []
    monkeypatch.setattr(
        "app.services.scoring_service.publish_event",
        AsyncMock(side_effect=lambda event: published.append(event)),
    )

    service = ScoringService(_mock_db_with_team())
    ok = await service.update_team_scores(team_id=5, should_commit=True)

    assert ok is True
    assert len(published) == 1
    assert published[0].event_type == EventType.TEAM_SCORE_UPDATED.value
    assert published[0].payload.team_id == 5


async def test_update_team_scores_no_publish_without_commit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    published = []
    monkeypatch.setattr(
        "app.services.scoring_service.publish_event",
        AsyncMock(side_effect=lambda event: published.append(event)),
    )

    service = ScoringService(_mock_db_with_team())
    # Batched callers defer the commit; the event must fire only on real persistence.
    await service.update_team_scores(team_id=5, should_commit=False)

    assert published == []
