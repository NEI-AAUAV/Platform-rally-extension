"""API tests for the team self-check-in endpoint (mock-based)."""

from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.api_v1 import checkin as checkin_api
from app.api.deps import get_current_team
from app.core.config import settings
from app.main import app
from app.schemas.team_auth import TeamTokenData
from app.services.checkin_token import CheckinClaims, CheckinTokenError

CHECK_IN_URL = "/api/rally/v1/checkpoint/check-in"


@pytest.fixture
def as_team() -> Iterator[None]:
    """Override team auth so requests act as team 1."""
    app.dependency_overrides[get_current_team] = lambda: TeamTokenData(
        team_id=1, team_name="Alpha"
    )
    yield
    app.dependency_overrides.pop(get_current_team, None)


@pytest.fixture
def enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SELF_CHECKIN_ENABLED", True)


def _wire(
    monkeypatch: pytest.MonkeyPatch,
    *,
    checkpoint_order: int = 1,
    team_times: list[Any] | None = None,
    nonce_fresh: bool = True,
) -> dict[str, AsyncMock]:
    monkeypatch.setattr(
        checkin_api,
        "verify_checkin_token",
        MagicMock(
            return_value=CheckinClaims(checkpoint_id=5, issued_at=0, nonce="n1")
        ),
    )
    monkeypatch.setattr(
        checkin_api, "_claim_nonce", AsyncMock(return_value=nonce_fresh)
    )
    monkeypatch.setattr(
        "app.crud.crud_checkpoint.checkpoint.get",
        AsyncMock(return_value=SimpleNamespace(id=5, order=checkpoint_order)),
    )
    monkeypatch.setattr(
        "app.crud.crud_team.team.get",
        AsyncMock(return_value=SimpleNamespace(times=team_times or [])),
    )
    advance = AsyncMock()
    monkeypatch.setattr(checkin_api, "checkin_team_to_checkpoint", advance)
    publish = AsyncMock()
    monkeypatch.setattr(checkin_api, "publish_event", publish)
    return {"advance": advance, "publish": publish}


def test_check_in_success(
    client: TestClient,
    as_team: None,
    enabled: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mocks = _wire(monkeypatch)

    resp = client.post(CHECK_IN_URL, json={"token": "whatever"})

    assert resp.status_code == 200
    assert resp.json() == {"team_id": 1, "checkpoint_id": 5, "checkpoint_order": 1}
    mocks["advance"].assert_awaited_once()
    mocks["publish"].assert_awaited_once()


def test_check_in_disabled_returns_404(
    client: TestClient, as_team: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "SELF_CHECKIN_ENABLED", False)
    resp = client.post(CHECK_IN_URL, json={"token": "x"})
    assert resp.status_code == 404


def test_check_in_bad_token_returns_400(
    client: TestClient,
    as_team: None,
    enabled: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        checkin_api,
        "verify_checkin_token",
        MagicMock(side_effect=CheckinTokenError("expired")),
    )
    resp = client.post(CHECK_IN_URL, json={"token": "stale"})
    assert resp.status_code == 400


def test_check_in_out_of_order_returns_409(
    client: TestClient,
    as_team: None,
    enabled: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Scanned checkpoint order 3 but team has visited none (expects order 1).
    mocks = _wire(monkeypatch, checkpoint_order=3, team_times=[])
    resp = client.post(CHECK_IN_URL, json={"token": "skip"})
    assert resp.status_code == 409
    mocks["advance"].assert_not_awaited()


def test_check_in_replayed_token_returns_409(
    client: TestClient,
    as_team: None,
    enabled: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mocks = _wire(monkeypatch, nonce_fresh=False)
    resp = client.post(CHECK_IN_URL, json={"token": "reused"})
    assert resp.status_code == 409
    mocks["advance"].assert_not_awaited()


def test_check_in_requires_team_auth(client: TestClient, enabled: None) -> None:
    # No team override installed -> missing bearer -> 401.
    resp = client.post(CHECK_IN_URL, json={"token": "x"})
    assert resp.status_code == 401
