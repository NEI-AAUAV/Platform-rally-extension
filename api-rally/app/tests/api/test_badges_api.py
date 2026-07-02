"""API tests for the read-only badge endpoints (service layer mocked)."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.models.badge import TeamBadge
from app.models.badge_definition import BadgeDefinition


def _defn(code: str, name: str) -> BadgeDefinition:
    d = BadgeDefinition(code=code, name=name, is_active=True, is_auto=True)
    d.description = None
    d.icon_url = None
    d.color = "#8b5cf6"
    d.glyph = "★"
    return d


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


@pytest.fixture(autouse=True)
def _badges_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Default the kill-switch on for these read-only tests."""
    monkeypatch.setattr(
        "app.api.api_v1.badges.rally_settings.get_or_create",
        AsyncMock(return_value=SimpleNamespace(badges_enabled=True)),
    )


def _disable_badges(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.api_v1.badges.rally_settings.get_or_create",
        AsyncMock(return_value=SimpleNamespace(badges_enabled=False)),
    )


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


def test_team_badge_showcase(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # Catalogue has two active badges; the team earned only the first.
    definitions = [_defn("won_duel", "Duelo"), _defn("locked_one", "Bloqueado")]
    earned = [_badge(1, 7, "won_duel", 99)]
    monkeypatch.setattr(
        "app.services.badge_service.get_showcase",
        AsyncMock(return_value=(definitions, earned)),
    )

    resp = client.get("/api/rally/v1/teams/7/badge-showcase")

    assert resp.status_code == 200
    body = resp.json()
    codes = [d["code"] for d in body["definitions"]]
    assert codes == ["won_duel", "locked_one"]  # all active, incl. locked
    earned_codes = [e["code"] for e in body["earned"]]
    assert earned_codes == ["won_duel"]  # only what the team holds
    assert "locked_one" not in earned_codes


# ---------- kill-switch: disabled hides everything ----------

def test_list_all_badges_empty_when_disabled(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _disable_badges(monkeypatch)
    service = AsyncMock()
    monkeypatch.setattr("app.services.badge_service.list_all_badges", service)

    resp = client.get("/api/rally/v1/badges")

    assert resp.status_code == 200
    assert resp.json() == []
    service.assert_not_awaited()


def test_showcase_empty_when_disabled(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _disable_badges(monkeypatch)
    service = AsyncMock()
    monkeypatch.setattr("app.services.badge_service.get_showcase", service)

    resp = client.get("/api/rally/v1/teams/7/badge-showcase")

    assert resp.status_code == 200
    body = resp.json()
    assert body["definitions"] == []
    assert body["earned"] == []
    service.assert_not_awaited()
