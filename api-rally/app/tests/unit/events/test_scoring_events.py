"""Unit test: update_team_scores publishes a TeamScoreUpdated event."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.events import EventType
from app.services.scoring_service import ScoringService


def _mock_db_with_team() -> AsyncMock:
    db = AsyncMock()
    # A team with no checkpoints/results: total resolves to 0, no array work.
    db.get.return_value = SimpleNamespace(id=5, total=0, score_per_checkpoint=[], times=[])
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


@pytest.mark.parametrize(
    "event_cls_name, expected_type",
    [
        ("ActivityResultCreatedEvent", EventType.ACTIVITY_RESULT_CREATED),
        ("ActivityResultUpdatedEvent", EventType.ACTIVITY_RESULT_UPDATED),
        ("ActivityResultDeletedEvent", EventType.ACTIVITY_RESULT_DELETED),
    ],
)
async def test_publish_result_change_emits_typed_event(
    monkeypatch: pytest.MonkeyPatch, event_cls_name: str, expected_type: EventType
) -> None:
    import app.services.scoring_service as svc

    published = []
    monkeypatch.setattr(svc, "publish_event", AsyncMock(side_effect=lambda e: published.append(e)))

    service = ScoringService(AsyncMock())
    await service._publish_result_change(
        getattr(svc, event_cls_name), result_id=7, team_id=3, activity_id=9
    )

    assert len(published) == 1
    assert published[0].event_type == expected_type.value
    assert published[0].payload.result_id == 7
    assert published[0].payload.team_id == 3
    assert published[0].payload.activity_id == 9


async def test_remove_result_publishes_deleted_after_commit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """remove_result emits ACTIVITY_RESULT_DELETED with the gone row's ids."""
    import app.services.scoring_service as svc

    published = []
    monkeypatch.setattr(svc, "publish_event", AsyncMock(side_effect=lambda e: published.append(e)))

    from app.crud import crud_activity

    db_obj = SimpleNamespace(id=11, team_id=3, activity_id=9)
    # scoring_service holds the same crud singleton, so patch it at the source.
    monkeypatch.setattr(crud_activity.activity_result, "get", AsyncMock(return_value=db_obj))
    monkeypatch.setattr(crud_activity.activity_result, "delete", AsyncMock())

    service = ScoringService(AsyncMock())
    monkeypatch.setattr(service, "update_team_scores", AsyncMock(return_value=True))

    removed = await service.remove_result(11)

    assert removed is db_obj
    assert len(published) == 1
    assert published[0].event_type == EventType.ACTIVITY_RESULT_DELETED.value
    assert published[0].payload.result_id == 11
    assert published[0].payload.team_id == 3
    assert published[0].payload.activity_id == 9
