"""API tests for the team self-check-in endpoint, against real Postgres.

`verify_checkin_token`/`_claim_nonce` stay mocked — QR crypto and Redis nonce
tracking are out of scope; everything else (DB, ABAC, routing, add_checkpoint)
runs for real.
"""
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.api_v1 import checkin as checkin_api
from app.api.deps import get_current_team
from app.core.config import get_settings
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.main import app
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.schemas.team_auth import TeamTokenData
from app.services.checkin_token import CheckinClaims, CheckinTokenError

CHECK_IN_URL = "/api/rally/v1/checkpoint/check-in"


async def _make_event(pg_session):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Test Event", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _activate_rally(pg_session, event):
    """rally_settings.rally_start_time/end_time are read-only in practice:
    `CRUDRallySettings.get_or_create` always overwrites them from the current
    event's start_time/end_time (`_sync_timing_from_event`), so writing the
    settings row directly is silently reverted on the next read. Set the
    event's timing instead — that's the actual source of truth.
    """
    now = datetime.now(timezone.utc)
    event.start_time = now - timedelta(hours=1)
    event.end_time = now + timedelta(hours=1)
    pg_session.add(event)
    await pg_session.commit()
    return await rally_settings.get_or_create(pg_session)


async def _make_team(pg_session, name="Alpha"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order)
    )


@pytest.fixture
def as_checkin_team():
    def _make(team_id: int, team_name: str = "Alpha"):
        app.dependency_overrides[get_current_team] = lambda: TeamTokenData(
            team_id=team_id, team_name=team_name
        )

    yield _make
    app.dependency_overrides.pop(get_current_team, None)


@contextmanager
def _override_settings(**overrides: Any) -> Iterator[None]:
    base = get_settings()
    patched = base.model_copy(update=overrides)
    app.dependency_overrides[get_settings] = lambda: patched
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_settings, None)


def _wire_token(monkeypatch: pytest.MonkeyPatch, checkpoint_id: int, *, nonce_fresh=True):
    monkeypatch.setattr(
        checkin_api,
        "verify_checkin_token",
        MagicMock(return_value=CheckinClaims(checkpoint_id=checkpoint_id, issued_at=0, nonce="n1")),
    )
    monkeypatch.setattr(checkin_api, "_claim_nonce", AsyncMock(return_value=nonce_fresh))


async def test_check_in_success(pg_session, pg_client, as_checkin_team, monkeypatch):
    event = await _make_event(pg_session)
    await _activate_rally(pg_session, event)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    team = await _make_team(pg_session)
    as_checkin_team(team.id, team.name)
    _wire_token(monkeypatch, checkpoint.id)

    with _override_settings(SELF_CHECKIN_ENABLED=True):
        resp = pg_client.post(CHECK_IN_URL, json={"token": "whatever"})

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"team_id": team.id, "checkpoint_id": checkpoint.id, "checkpoint_order": 1}


async def test_check_in_disabled_returns_404(pg_session, pg_client, as_checkin_team):
    await _make_event(pg_session)
    team = await _make_team(pg_session)
    as_checkin_team(team.id, team.name)

    with _override_settings(SELF_CHECKIN_ENABLED=False):
        resp = pg_client.post(CHECK_IN_URL, json={"token": "x"})

    assert resp.status_code == 404


async def test_check_in_bad_token_returns_400(pg_session, pg_client, as_checkin_team, monkeypatch):
    await _make_event(pg_session)
    team = await _make_team(pg_session)
    as_checkin_team(team.id, team.name)
    monkeypatch.setattr(
        checkin_api, "verify_checkin_token", MagicMock(side_effect=CheckinTokenError("expired"))
    )

    with _override_settings(SELF_CHECKIN_ENABLED=True):
        resp = pg_client.post(CHECK_IN_URL, json={"token": "stale"})

    assert resp.status_code == 400


async def test_check_in_out_of_order_returns_409(pg_session, pg_client, as_checkin_team, monkeypatch):
    event = await _make_event(pg_session)
    await _activate_rally(pg_session, event)
    await _make_checkpoint(pg_session, order=1)
    checkpoint_3 = await _make_checkpoint(pg_session, order=3)
    team = await _make_team(pg_session)
    as_checkin_team(team.id, team.name)
    _wire_token(monkeypatch, checkpoint_3.id)

    with _override_settings(SELF_CHECKIN_ENABLED=True):
        resp = pg_client.post(CHECK_IN_URL, json={"token": "skip"})

    assert resp.status_code == 409


async def test_check_in_replayed_token_returns_409(pg_session, pg_client, as_checkin_team, monkeypatch):
    event = await _make_event(pg_session)
    await _activate_rally(pg_session, event)
    checkpoint = await _make_checkpoint(pg_session, order=1)
    team = await _make_team(pg_session)
    as_checkin_team(team.id, team.name)
    _wire_token(monkeypatch, checkpoint.id, nonce_fresh=False)

    with _override_settings(SELF_CHECKIN_ENABLED=True):
        resp = pg_client.post(CHECK_IN_URL, json={"token": "reused"})

    assert resp.status_code == 409


async def test_check_in_requires_team_auth(pg_session, pg_client):
    await _make_event(pg_session)

    with _override_settings(SELF_CHECKIN_ENABLED=True):
        resp = pg_client.post(CHECK_IN_URL, json={"token": "x"})

    assert resp.status_code == 401
