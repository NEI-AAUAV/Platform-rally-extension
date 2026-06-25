"""API tests for the read-only badge endpoints (service layer mocked)."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.models.badge import TeamBadge


def _badge(badge_id: int, team_id: int, badge_type: str, activity_id: int) -> TeamBadge:
    badge = TeamBadge(
        team_id=team_id,
        badge_type=badge_type,
        activity_id=activity_id,
        meta={"opponent_team_id": 2},
    )
    badge.id = badge_id
    badge.awarded_at = datetime.now(timezone.utc)
    return badge


def test_list_all_badges(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.badge_service.list_all_badges",
        AsyncMock(return_value=[_badge(1, 10, "head_to_head_win", 99)]),
    )

    resp = client.get("/api/rally/v1/badges")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["team_id"] == 10
    assert body[0]["badge_type"] == "head_to_head_win"
    assert body[0]["activity_id"] == 99


def test_list_team_badges(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    mock = AsyncMock(
        return_value=[_badge(2, 7, "first_to_complete_activity", 5)]
    )
    monkeypatch.setattr("app.services.badge_service.list_team_badges", mock)

    resp = client.get("/api/rally/v1/teams/7/badges")

    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["badge_type"] == "first_to_complete_activity"
    mock.assert_awaited_once()
    # Path team_id reached the service.
    assert mock.await_args is not None
    assert mock.await_args.args[1] == 7
