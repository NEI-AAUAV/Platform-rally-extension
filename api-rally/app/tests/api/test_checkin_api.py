"""API tests for the team self-check-in endpoint, against real Postgres.

`verify_checkin_token`/`CheckinService.claim_nonce` stay mocked — QR crypto and Redis nonce
tracking are out of scope; everything else (DB, ABAC, routing, add_checkpoint)
runs for real.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.api_v1 import checkin as checkin_api
from app.services.checkin_service import CheckinService
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
from app.tests.conftest import make_event as _make_event

CHECK_IN_URL = "/api/rally/v1/checkpoint/check-in"


async def _activate_rally(pg_session, event):
    """rally_settings.rally_start_time/end_time are read-only in practice:
    `CRUDRallySettings.get_or_create` always overwrites them from the current
    event's start_time/end_time (`_sync_timing_from_event`), so writing the
    settings row directly is silently reverted on the next read. Set the
    event's timing instead — that's the actual source of truth.
    """
    now = datetime.now(UTC)
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
    monkeypatch.setattr(CheckinService, "claim_nonce", AsyncMock(return_value=nonce_fresh))


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
    assert resp.json() == {
        "team_id": team.id,
        "checkpoint_id": checkpoint.id,
        "checkpoint_order": 1,
    }


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


async def test_check_in_out_of_order_returns_409(
    pg_session, pg_client, as_checkin_team, monkeypatch
):
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


async def test_check_in_replayed_token_returns_409(
    pg_session, pg_client, as_checkin_team, monkeypatch
):
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


async def test_check_in_checkpoint_not_found(pg_session, pg_client, as_checkin_team, monkeypatch):
    await _make_event(pg_session)
    team = await _make_team(pg_session)
    as_checkin_team(team.id, team.name)
    _wire_token(monkeypatch, 999999)

    with _override_settings(SELF_CHECKIN_ENABLED=True):
        resp = pg_client.post(CHECK_IN_URL, json={"token": "whatever"})

    assert resp.status_code == 404


async def test_check_in_cross_event_rejected(pg_session, pg_client, as_checkin_team, monkeypatch):
    """A team from event A cannot check into a checkpoint scoped to event B."""
    from app.models.activity import RallyEvent

    event_a = await _make_event(pg_session)
    await _activate_rally(pg_session, event_a)
    event_b = RallyEvent(name="Other Event", is_current=False)
    pg_session.add(event_b)
    await pg_session.commit()
    await pg_session.refresh(event_b)

    checkpoint = await _make_checkpoint(pg_session, order=1)
    checkpoint.event_id = event_b.id
    pg_session.add(checkpoint)
    await pg_session.commit()

    team = await _make_team(pg_session)
    team.event_id = event_a.id
    pg_session.add(team)
    await pg_session.commit()

    as_checkin_team(team.id, team.name)
    _wire_token(monkeypatch, checkpoint.id)

    with _override_settings(SELF_CHECKIN_ENABLED=True):
        resp = pg_client.post(CHECK_IN_URL, json={"token": "whatever"})

    assert resp.status_code == 404


CHECKIN_TOKEN_URL = "/api/rally/v1/checkpoint/checkin-token"


class TestGetCheckinToken:
    def _staff_override(self, checkpoint_id=None):
        from app.api import deps
        from app.api.auth import AuthData, api_nei_auth
        from app.schemas.user import DetailedUser

        user = DetailedUser(
            id=10,
            name="Staff",
            disabled=False,
            staff_checkpoint_id=checkpoint_id,
            scopes=["rally-staff"],
        )
        auth = AuthData(oidc_sub="staff-1", name="Staff", scopes=["rally-staff"])
        app.dependency_overrides[api_nei_auth] = lambda: auth
        app.dependency_overrides[deps.get_admin_or_staff] = lambda: user
        app.dependency_overrides[deps.get_current_user] = lambda: user

    def _clear_staff_override(self):
        from app.api import deps
        from app.api.auth import api_nei_auth

        app.dependency_overrides.pop(api_nei_auth, None)
        app.dependency_overrides.pop(deps.get_admin_or_staff, None)
        app.dependency_overrides.pop(deps.get_current_user, None)

    async def test_get_checkin_token_disabled_404(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        with _override_settings(SELF_CHECKIN_ENABLED=False):
            resp = pg_client.get("/api/rally/v1/checkpoint/checkin-token")

        assert resp.status_code == 404

    async def test_get_checkin_token_staff_own_checkpoint(self, pg_session, pg_client):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        self._staff_override(checkpoint_id=checkpoint.id)
        try:
            with _override_settings(SELF_CHECKIN_ENABLED=True):
                resp = pg_client.get("/api/rally/v1/checkpoint/checkin-token")
        finally:
            self._clear_staff_override()

        assert resp.status_code == 200, resp.text
        assert "token" in resp.json()

    async def test_get_checkin_token_staff_no_checkpoint_403(self, pg_session, pg_client):
        await _make_event(pg_session)
        self._staff_override(checkpoint_id=None)
        try:
            with _override_settings(SELF_CHECKIN_ENABLED=True):
                resp = pg_client.get("/api/rally/v1/checkpoint/checkin-token")
        finally:
            self._clear_staff_override()

        assert resp.status_code == 403

    async def test_get_checkin_token_staff_other_checkpoint_forbidden(self, pg_session, pg_client):
        await _make_event(pg_session)
        own_cp = await _make_checkpoint(pg_session, order=1)
        other_cp = await _make_checkpoint(pg_session, order=2)
        self._staff_override(checkpoint_id=own_cp.id)
        try:
            with _override_settings(SELF_CHECKIN_ENABLED=True):
                resp = pg_client.get(
                    "/api/rally/v1/checkpoint/checkin-token",
                    params={"checkpoint_id": other_cp.id},
                )
        finally:
            self._clear_staff_override()

        assert resp.status_code == 403

    async def test_get_checkin_token_admin_explicit_checkpoint(
        self, pg_session, pg_client, as_admin
    ):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)

        with _override_settings(SELF_CHECKIN_ENABLED=True):
            resp = pg_client.get(
                "/api/rally/v1/checkpoint/checkin-token",
                params={"checkpoint_id": checkpoint.id},
            )

        assert resp.status_code == 200, resp.text

    async def test_get_checkin_token_admin_no_checkpoint_403(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        with _override_settings(SELF_CHECKIN_ENABLED=True):
            resp = pg_client.get("/api/rally/v1/checkpoint/checkin-token")

        assert resp.status_code == 403


class TestStaffCheckIn:
    def _staff_override(self, checkpoint_id=None):
        from app.api import deps
        from app.api.auth import AuthData, api_nei_auth
        from app.schemas.user import DetailedUser

        user = DetailedUser(
            id=11,
            name="Staff",
            disabled=False,
            staff_checkpoint_id=checkpoint_id,
            scopes=["rally-staff"],
        )
        auth = AuthData(oidc_sub="staff-2", name="Staff", scopes=["rally-staff"])
        app.dependency_overrides[api_nei_auth] = lambda: auth
        app.dependency_overrides[deps.get_admin_or_staff] = lambda: user
        app.dependency_overrides[deps.get_current_user] = lambda: user

    def _clear_staff_override(self):
        from app.api import deps
        from app.api.auth import api_nei_auth

        app.dependency_overrides.pop(api_nei_auth, None)
        app.dependency_overrides.pop(deps.get_admin_or_staff, None)
        app.dependency_overrides.pop(deps.get_current_user, None)

    STAFF_CHECKIN_URL = "/api/rally/v1/checkpoint/staff-check-in"

    async def test_staff_check_in_disabled_404(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        with _override_settings(SELF_CHECKIN_ENABLED=False):
            resp = pg_client.post(self.STAFF_CHECKIN_URL, json={"team_code": "X"})

        assert resp.status_code == 404

    async def test_staff_check_in_no_checkpoint_403(self, pg_session, pg_client):
        await _make_event(pg_session)
        self._staff_override(checkpoint_id=None)
        try:
            with _override_settings(SELF_CHECKIN_ENABLED=True):
                resp = pg_client.post(self.STAFF_CHECKIN_URL, json={"team_code": "X"})
        finally:
            self._clear_staff_override()

        assert resp.status_code == 403

    async def test_staff_check_in_team_not_found(self, pg_session, pg_client):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        self._staff_override(checkpoint_id=checkpoint.id)
        try:
            with _override_settings(SELF_CHECKIN_ENABLED=True):
                resp = pg_client.post(self.STAFF_CHECKIN_URL, json={"team_code": "NOPE"})
        finally:
            self._clear_staff_override()

        assert resp.status_code == 404

    async def test_staff_check_in_checkpoint_not_found(self, pg_session, pg_client):
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        self._staff_override(checkpoint_id=999999)
        try:
            with _override_settings(SELF_CHECKIN_ENABLED=True):
                resp = pg_client.post(
                    self.STAFF_CHECKIN_URL,
                    json={"team_code": team.access_code},
                )
        finally:
            self._clear_staff_override()

        assert resp.status_code == 404

    async def test_staff_check_in_success_checked_in(self, pg_session, pg_client):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        self._staff_override(checkpoint_id=checkpoint.id)
        try:
            with _override_settings(SELF_CHECKIN_ENABLED=True):
                resp = pg_client.post(
                    self.STAFF_CHECKIN_URL,
                    json={"team_code": team.access_code},
                )
        finally:
            self._clear_staff_override()

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "checked_in"
        assert body["team_id"] == team.id

    async def test_staff_check_in_already_present(self, pg_session, pg_client):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)
        self._staff_override(checkpoint_id=checkpoint.id)
        try:
            with _override_settings(SELF_CHECKIN_ENABLED=True):
                first = pg_client.post(self.STAFF_CHECKIN_URL, json={"team_code": team.access_code})
                assert first.status_code == 200, first.text
                second = pg_client.post(
                    self.STAFF_CHECKIN_URL, json={"team_code": team.access_code}
                )
        finally:
            self._clear_staff_override()

        assert second.status_code == 200, second.text
        assert second.json()["status"] == "already_present"

    async def test_staff_check_in_ahead(self, pg_session, pg_client):
        await _make_event(pg_session)
        await _make_checkpoint(pg_session, order=1)
        checkpoint_2 = await _make_checkpoint(pg_session, order=2)
        team = await _make_team(pg_session)
        self._staff_override(checkpoint_id=checkpoint_2.id)
        try:
            with _override_settings(SELF_CHECKIN_ENABLED=True):
                resp = pg_client.post(self.STAFF_CHECKIN_URL, json={"team_code": team.access_code})
        finally:
            self._clear_staff_override()

        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "ahead"

    async def test_staff_check_in_admin_explicit_checkpoint(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session, order=1)
        team = await _make_team(pg_session)

        with _override_settings(SELF_CHECKIN_ENABLED=True):
            resp = pg_client.post(
                self.STAFF_CHECKIN_URL,
                json={"team_code": team.access_code, "checkpoint_id": checkpoint.id},
            )

        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "checked_in"

    async def test_staff_check_in_admin_no_checkpoint_assigned_403(
        self, pg_session, pg_client, as_admin
    ):
        """An admin with no staff_checkpoint_id and no explicit checkpoint_id in
        the body has nothing to resolve `checkpoint_id` to (line 182-183):
        `get_staff_with_checkpoint_access` only 403s staff without a checkpoint,
        not admins, so this path is reached only through the admin branch.
        """
        await _make_event(pg_session)
        team = await _make_team(pg_session)

        with _override_settings(SELF_CHECKIN_ENABLED=True):
            resp = pg_client.post(
                self.STAFF_CHECKIN_URL,
                json={"team_code": team.access_code},
            )

        assert resp.status_code == 403
