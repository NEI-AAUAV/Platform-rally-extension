"""Tests for Team Auth API endpoints (team login / token management), against
real Postgres for the HTTP-layer tests. Token-helper unit tests need no DB."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from jose import jwt

from app.core.config import settings
from app.crud.crud_team import team as crud_team
from app.schemas.team import TeamCreate, TeamUpdate


async def _make_team(pg_session, name="Test Team"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)


# ---------------------------------------------------------------------------
# Unit tests for token helpers (no HTTP layer, no DB)
# ---------------------------------------------------------------------------


class TestCreateTeamAccessToken:
    def test_creates_valid_jwt(self):
        from app.api.api_v1.team_auth import create_team_access_token

        token = create_team_access_token(team_id=1, team_name="Test Team")

        assert settings.TEAM_JWT_SECRET_KEY is not None
        payload = jwt.decode(
            token, settings.TEAM_JWT_SECRET_KEY, algorithms=[settings.TEAM_JWT_ALGORITHM]
        )
        assert payload["team_id"] == 1
        assert payload["team_name"] == "Test Team"
        assert payload["auth_version"] == 1
        assert payload["event_id"] == 1
        assert payload["type"] == "team_access"

    def test_token_includes_expiry(self):
        from app.api.api_v1.team_auth import create_team_access_token

        token = create_team_access_token(team_id=1, team_name="Test Team")

        payload = jwt.decode(
            token, settings.TEAM_JWT_SECRET_KEY, algorithms=[settings.TEAM_JWT_ALGORITHM]
        )
        assert "exp" in payload

    def test_expiry_matches_settings(self):
        from app.api.api_v1.team_auth import create_team_access_token

        before = datetime.now(UTC)
        token = create_team_access_token(team_id=1, team_name="Test Team")
        after = datetime.now(UTC)

        payload = jwt.decode(
            token, settings.TEAM_JWT_SECRET_KEY, algorithms=[settings.TEAM_JWT_ALGORITHM]
        )
        expire_delta = timedelta(hours=settings.TEAM_TOKEN_EXPIRE_HOURS)
        exp = datetime.fromtimestamp(payload["exp"], tz=UTC)
        assert (
            before + expire_delta - timedelta(seconds=1)
            <= exp
            <= after + expire_delta + timedelta(seconds=5)
        )


class TestDecodeTeamToken:
    def test_rejects_missing_revocation_claims(self):
        from app.services.team_auth_service import decode_team_token

        token = jwt.encode(
            {
                "team_id": 1,
                "team_name": "Test Team",
                "type": "team_access",
                "exp": datetime.now(UTC) + timedelta(hours=1),
            },
            settings.TEAM_JWT_SECRET_KEY,
            algorithm=settings.TEAM_JWT_ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc:
            decode_team_token(token)
        assert exc.value.status_code == 401


# ---------------------------------------------------------------------------
# Integration tests (HTTP layer, real Postgres)
# ---------------------------------------------------------------------------


class TestTeamAuthAPI:
    async def test_login_success(self, pg_session, pg_client):
        team = await _make_team(pg_session)

        response = pg_client.post(
            "/api/rally/v1/team-auth/login", json={"access_code": team.access_code}
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["team_id"] == team.id
        assert data["team_name"] == team.name

    async def test_login_invalid_code(self, pg_session, pg_client):
        await _make_team(pg_session)

        response = pg_client.post(
            "/api/rally/v1/team-auth/login", json={"access_code": "WRNG-CODE"}
        )

        assert response.status_code == 401

    def test_login_missing_body(self, pg_client):
        response = pg_client.post("/api/rally/v1/team-auth/login", json={})
        assert response.status_code == 422

    @pytest.mark.parametrize(
        "bad_code",
        ["short", "abcd-1234", "ABCD1234", "ABCD-12345", "A" * 100, "ABCD-123!"],
    )
    def test_login_rejects_malformed_access_code(self, pg_client, bad_code):
        response = pg_client.post("/api/rally/v1/team-auth/login", json={"access_code": bad_code})
        assert response.status_code == 422

    async def test_refresh_with_valid_token(self, pg_session, pg_client):
        team = await _make_team(pg_session)
        login = pg_client.post(
            "/api/rally/v1/team-auth/login", json={"access_code": team.access_code}
        )
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]

        response = pg_client.post(
            "/api/rally/v1/team-auth/refresh", headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["team_id"] == team.id
        assert data["team_name"] == team.name

    def test_refresh_with_invalid_token(self, pg_client):
        response = pg_client.post(
            "/api/rally/v1/team-auth/refresh",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert response.status_code in [401, 404]

    def test_refresh_without_token(self, pg_client):
        response = pg_client.post("/api/rally/v1/team-auth/refresh")
        assert response.status_code in [401, 403, 404, 422]


class TestTokenLifecycleHardening:
    async def test_access_code_rotation_revokes_existing_token(self, pg_session, pg_client):
        team = await _make_team(pg_session)
        login = pg_client.post(
            "/api/rally/v1/team-auth/login", json={"access_code": team.access_code}
        )
        assert login.status_code == 200, login.text

        await crud_team.update(
            pg_session,
            id=team.id,
            obj_in=TeamUpdate(access_code="NEWW-0001"),
            commit=True,
        )
        revoked = pg_client.get(
            "/api/rally/v1/team-auth/verify",
            headers={"Authorization": f"Bearer {login.json()['access_token']}"},
        )
        assert revoked.status_code == 401

    async def test_deleted_team_token_is_revoked(self, pg_session, pg_client):
        team = await _make_team(pg_session)
        login = pg_client.post(
            "/api/rally/v1/team-auth/login", json={"access_code": team.access_code}
        )
        assert login.status_code == 200, login.text
        await crud_team.remove(pg_session, id=team.id, commit=True)

        revoked = pg_client.get(
            "/api/rally/v1/team-auth/verify",
            headers={"Authorization": f"Bearer {login.json()['access_token']}"},
        )
        assert revoked.status_code == 401

    async def test_edition_switch_revokes_existing_token(self, pg_session, pg_client):
        from app.crud.crud_activity import rally_event
        from app.schemas.activity import RallyEventCreate

        team = await _make_team(pg_session)
        login = pg_client.post(
            "/api/rally/v1/team-auth/login", json={"access_code": team.access_code}
        )
        assert login.status_code == 200, login.text
        next_event = await rally_event.create(
            pg_session, obj_in=RallyEventCreate(name="Next edition", is_current=False)
        )
        await rally_event.set_current(pg_session, event_id=next_event.id)

        revoked = pg_client.get(
            "/api/rally/v1/team-auth/verify",
            headers={"Authorization": f"Bearer {login.json()['access_token']}"},
        )
        assert revoked.status_code == 401

    async def test_refresh_carries_original_login_time(self, pg_session, pg_client):
        from app.api.api_v1.team_auth import create_team_access_token

        team = await _make_team(pg_session)
        orig = int((datetime.now(UTC) - timedelta(hours=2)).timestamp())
        event = await crud_team.get_current_event(pg_session)
        token = create_team_access_token(
            team_id=team.id,
            team_name=team.name,
            auth_version=team.auth_version,
            event_id=event.id,
            orig_iat=orig,
        )

        response = pg_client.post(
            "/api/rally/v1/team-auth/refresh", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        payload = jwt.decode(
            response.json()["access_token"], settings.TEAM_JWT_SECRET_KEY, algorithms=["HS256"]
        )
        assert payload["orig_iat"] == orig

    async def test_refresh_rejected_beyond_absolute_lifetime(self, pg_session, pg_client):
        from app.api.api_v1.team_auth import create_team_access_token

        team = await _make_team(pg_session)
        event = await crud_team.get_current_event(pg_session)
        too_old = int(
            (
                datetime.now(UTC) - timedelta(hours=settings.TEAM_TOKEN_MAX_LIFETIME_HOURS + 1)
            ).timestamp()
        )
        token = create_team_access_token(
            team_id=team.id,
            team_name=team.name,
            auth_version=team.auth_version,
            event_id=event.id,
            orig_iat=too_old,
        )

        response = pg_client.post(
            "/api/rally/v1/team-auth/refresh", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401
        assert "log in again" in response.json()["detail"].lower()

    async def test_verify_accepts_valid_and_rejects_expired(self, pg_session, pg_client):
        team = await _make_team(pg_session, "Sete")
        login = pg_client.post(
            "/api/rally/v1/team-auth/login", json={"access_code": team.access_code}
        )
        assert login.status_code == 200, login.text
        valid = login.json()["access_token"]
        ok = pg_client.get(
            "/api/rally/v1/team-auth/verify", headers={"Authorization": f"Bearer {valid}"}
        )
        assert ok.status_code == 200
        assert ok.json()["team_id"] == team.id

        expired = jwt.encode(
            {
                "team_id": team.id,
                "team_name": team.name,
                "auth_version": team.auth_version,
                "event_id": team.event_id,
                "type": "team_access",
                "exp": datetime.now(UTC) - timedelta(minutes=1),
            },
            settings.TEAM_JWT_SECRET_KEY,
            algorithm="HS256",
        )
        bad = pg_client.get(
            "/api/rally/v1/team-auth/verify", headers={"Authorization": f"Bearer {expired}"}
        )
        assert bad.status_code == 401

    def test_verify_rejects_token_signed_with_other_algorithm_key(self, pg_client):
        forged = jwt.encode(
            {
                "team_id": 1,
                "team_name": "Forjada",
                "type": "team_access",
                "exp": datetime.now(UTC) + timedelta(hours=1),
            },
            "attacker-secret",
            algorithm="HS256",
        )
        response = pg_client.get(
            "/api/rally/v1/team-auth/verify", headers={"Authorization": f"Bearer {forged}"}
        )
        assert response.status_code == 401


class TestContestEvaluation:
    async def _make_event(self, pg_session):
        from app.models.activity import RallyEvent

        event = RallyEvent(name="Test Event", is_current=True)
        pg_session.add(event)
        await pg_session.commit()
        await pg_session.refresh(event)
        return event

    async def _make_result(self, pg_session, pg_client, as_admin_session):
        from app.crud.crud_activity import activity as crud_activity
        from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
        from app.schemas.activity import ActivityCreate, ActivityType
        from app.schemas.checkpoint import CheckPointCreate

        checkpoint = await crud_checkpoint.create(
            pg_session, obj_in=CheckPointCreate(name="CP1", order=1), commit=True
        )
        team = await _make_team(pg_session, "Contester")
        act = await crud_activity.create(
            pg_session,
            obj_in=ActivityCreate(
                name="Act",
                activity_type=ActivityType.GENERAL,
                checkpoint_id=checkpoint.id,
                config={},
            ),
        )
        resp = pg_client.post(
            "/api/rally/v1/activities/results/",
            json={
                "activity_id": act.id,
                "team_id": team.id,
                "result_data": {"assigned_points": 10},
            },
        )
        assert resp.status_code == 200, resp.text
        return team, resp.json()

    async def test_contest_result_not_found(self, pg_session, pg_client):
        from app.tests.conftest import as_team

        await self._make_event(pg_session)
        team = await _make_team(pg_session, "Loner")

        with as_team(team.id, "Loner"):
            resp = pg_client.post(
                "/api/rally/v1/team-auth/evaluations/999999/contest",
                json={"reason": "not fair"},
            )

        assert resp.status_code == 404

    async def test_contest_result_belonging_to_other_team_is_404(
        self, pg_session, pg_client, as_admin
    ):
        from app.tests.conftest import as_team

        await self._make_event(pg_session)
        _team, result = await self._make_result(pg_session, pg_client, as_admin)
        other_team = await _make_team(pg_session, "Other")

        with as_team(other_team.id, "Other"):
            resp = pg_client.post(
                f"/api/rally/v1/team-auth/evaluations/{result['id']}/contest",
                json={"reason": "not mine"},
            )

        assert resp.status_code == 404

    async def test_contest_own_result_succeeds(self, pg_session, pg_client, as_admin):
        from app.tests.conftest import as_team

        team, result = await self._make_result(pg_session, pg_client, as_admin)

        with as_team(team.id, "Contester"):
            resp = pg_client.post(
                f"/api/rally/v1/team-auth/evaluations/{result['id']}/contest",
                json={"reason": "I disagree with this score"},
            )

        assert resp.status_code == 200, resp.text
        assert resp.json()["note"] == "I disagree with this score"
