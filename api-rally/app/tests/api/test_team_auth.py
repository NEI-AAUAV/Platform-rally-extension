"""Tests for Team Auth API endpoints (team login / token management), against
real Postgres for the HTTP-layer tests. Token-helper unit tests need no DB."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from jose import jwt

from app.core.config import settings
from app.crud.crud_team import team as crud_team
from app.schemas.team import TeamCreate


async def _make_team(pg_session, name="Test Team"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


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


class TestVerifyTeamToken:
    def test_returns_team_data_for_valid_token(self):
        from app.api.api_v1.team_auth import create_team_access_token, verify_team_token

        token = create_team_access_token(team_id=42, team_name="Answer")
        data = verify_team_token(token)

        assert data.team_id == 42
        assert data.team_name == "Answer"

    def test_raises_for_expired_token(self):
        from app.api.api_v1.team_auth import verify_team_token

        expired_token = jwt.encode(
            {
                "team_id": 1,
                "team_name": "Test Team",
                "type": "team_access",
                "exp": datetime.now(UTC) - timedelta(seconds=1),
            },
            settings.TEAM_JWT_SECRET_KEY,
            algorithm=settings.TEAM_JWT_ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc:
            verify_team_token(expired_token)
        assert exc.value.status_code == 401

    def test_raises_for_invalid_token(self):
        from app.api.api_v1.team_auth import verify_team_token

        with pytest.raises(HTTPException) as exc:
            verify_team_token("not.a.valid.jwt")
        assert exc.value.status_code == 401

    def test_raises_for_wrong_token_type(self):
        """A validly-signed JWT with the wrong `type` claim (e.g. some other
        token kind) must be rejected, not treated as a team-access token."""
        from app.api.api_v1.team_auth import verify_team_token

        wrong_type_token = jwt.encode(
            {
                "team_id": 1,
                "team_name": "Test Team",
                "type": "not_team_access",
                "exp": datetime.now(UTC) + timedelta(hours=1),
            },
            settings.TEAM_JWT_SECRET_KEY,
            algorithm=settings.TEAM_JWT_ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc:
            verify_team_token(wrong_type_token)
        assert exc.value.status_code == 401

    def test_raises_for_missing_team_id(self):
        from app.api.api_v1.team_auth import verify_team_token

        missing_id_token = jwt.encode(
            {
                "team_name": "Test Team",
                "type": "team_access",
                "exp": datetime.now(UTC) + timedelta(hours=1),
            },
            settings.TEAM_JWT_SECRET_KEY,
            algorithm=settings.TEAM_JWT_ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc:
            verify_team_token(missing_id_token)
        assert exc.value.status_code == 401

    def test_raises_for_wrong_secret(self):
        from app.api.api_v1.team_auth import verify_team_token

        bad_token = jwt.encode(
            {
                "team_id": 1,
                "team_name": "Test Team",
                "type": "team_access",
                "exp": datetime.now(UTC) + timedelta(hours=1),
            },
            "wrong-secret",
            algorithm=settings.TEAM_JWT_ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc:
            verify_team_token(bad_token)
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

    def test_refresh_with_valid_token(self, pg_client):
        from app.api.api_v1.team_auth import create_team_access_token

        token = create_team_access_token(team_id=1, team_name="Test Team")

        response = pg_client.post(
            "/api/rally/v1/team-auth/refresh", headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["team_id"] == 1
        assert data["team_name"] == "Test Team"

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
    def test_refresh_carries_original_login_time(self, pg_client):
        from app.api.api_v1.team_auth import create_team_access_token

        orig = int((datetime.now(UTC) - timedelta(hours=2)).timestamp())
        token = create_team_access_token(team_id=1, team_name="T", orig_iat=orig)

        response = pg_client.post(
            "/api/rally/v1/team-auth/refresh", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        payload = jwt.decode(
            response.json()["access_token"], settings.TEAM_JWT_SECRET_KEY, algorithms=["HS256"]
        )
        assert payload["orig_iat"] == orig

    def test_refresh_rejected_beyond_absolute_lifetime(self, pg_client):
        from app.api.api_v1.team_auth import create_team_access_token

        too_old = int(
            (
                datetime.now(UTC) - timedelta(hours=settings.TEAM_TOKEN_MAX_LIFETIME_HOURS + 1)
            ).timestamp()
        )
        token = create_team_access_token(team_id=1, team_name="T", orig_iat=too_old)

        response = pg_client.post(
            "/api/rally/v1/team-auth/refresh", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401
        assert "log in again" in response.json()["detail"].lower()

    def test_verify_accepts_valid_and_rejects_expired(self, pg_client):
        from app.api.api_v1.team_auth import create_team_access_token

        valid = create_team_access_token(team_id=7, team_name="Sete")
        ok = pg_client.get(
            "/api/rally/v1/team-auth/verify", headers={"Authorization": f"Bearer {valid}"}
        )
        assert ok.status_code == 200
        assert ok.json()["team_id"] == 7

        expired = jwt.encode(
            {
                "team_id": 7,
                "team_name": "Sete",
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
            pg_session, obj_in=CheckPointCreate(name="CP1", order=1)
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
