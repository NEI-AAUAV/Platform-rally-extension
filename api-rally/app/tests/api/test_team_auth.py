"""
Tests for Team Auth API endpoints (team login / token management)
"""
import pytest
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from fastapi.testclient import TestClient
from jose import jwt

from app.main import app
from app.api.deps import get_db
from app.core.config import settings


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_db():
    """Mock database session"""
    return Mock()


@pytest.fixture
def client_with_mocked_db(mock_db):
    """Test client with mocked database"""
    def override_get_db():
        return mock_db

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def mock_team():
    """Mock team with access_code"""
    team = Mock()
    team.id = 1
    team.name = "Test Team"
    team.access_code = "ABCD-1234"
    team.is_active = True
    team.times = []
    team.total = 0
    return team


# ---------------------------------------------------------------------------
# Unit tests for token helpers (no HTTP layer)
# ---------------------------------------------------------------------------

class TestCreateTeamAccessToken:
    """Unit tests for create_team_access_token"""

    def test_creates_valid_jwt(self):
        """Token should be decodable and carry the team claims"""
        from app.api.api_v1.team_auth import create_team_access_token

        token = create_team_access_token(team_id=1, team_name="Test Team")

        assert settings.TEAM_JWT_SECRET_KEY is not None
        payload = jwt.decode(
            token,
            settings.TEAM_JWT_SECRET_KEY,
            algorithms=[settings.TEAM_JWT_ALGORITHM],
        )
        assert payload["team_id"] == 1
        assert payload["team_name"] == "Test Team"
        assert payload["type"] == "team_access"

    def test_token_includes_expiry(self):
        """Token should include an 'exp' claim"""
        from app.api.api_v1.team_auth import create_team_access_token

        token = create_team_access_token(team_id=1, team_name="Test Team")

        assert settings.TEAM_JWT_SECRET_KEY is not None
        payload = jwt.decode(
            token,
            settings.TEAM_JWT_SECRET_KEY,
            algorithms=[settings.TEAM_JWT_ALGORITHM],
        )
        assert "exp" in payload

    def test_expiry_matches_settings(self):
        """Token should expire TEAM_TOKEN_EXPIRE_HOURS from now"""
        from app.api.api_v1.team_auth import create_team_access_token

        before = datetime.now(timezone.utc)
        token = create_team_access_token(team_id=1, team_name="Test Team")
        after = datetime.now(timezone.utc)

        assert settings.TEAM_JWT_SECRET_KEY is not None
        payload = jwt.decode(
            token,
            settings.TEAM_JWT_SECRET_KEY,
            algorithms=[settings.TEAM_JWT_ALGORITHM],
        )
        expire_delta = timedelta(hours=settings.TEAM_TOKEN_EXPIRE_HOURS)
        # JWT exp is truncated to whole seconds, so allow 1s slack on the lower bound.
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert before + expire_delta - timedelta(seconds=1) <= exp <= after + expire_delta + timedelta(seconds=5)


class TestVerifyTeamToken:
    """Unit tests for verify_team_token"""

    def test_returns_team_data_for_valid_token(self):
        """Should decode a valid token and return its TeamTokenData"""
        from app.api.api_v1.team_auth import create_team_access_token, verify_team_token

        token = create_team_access_token(team_id=42, team_name="Answer")
        data = verify_team_token(token)

        assert data.team_id == 42
        assert data.team_name == "Answer"

    def test_raises_for_expired_token(self):
        """Should raise 401 for an expired token"""
        from app.api.api_v1.team_auth import verify_team_token

        assert settings.TEAM_JWT_SECRET_KEY is not None
        expired_token = jwt.encode(
            {
                "team_id": 1,
                "team_name": "Test Team",
                "type": "team_access",
                "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
            },
            settings.TEAM_JWT_SECRET_KEY,
            algorithm=settings.TEAM_JWT_ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc:
            verify_team_token(expired_token)
        assert exc.value.status_code == 401

    def test_raises_for_invalid_token(self):
        """Should raise 401 for a tampered / invalid token"""
        from app.api.api_v1.team_auth import verify_team_token

        with pytest.raises(HTTPException) as exc:
            verify_team_token("not.a.valid.jwt")
        assert exc.value.status_code == 401

    def test_raises_for_wrong_secret(self):
        """Should raise 401 when token was signed with a different secret"""
        from app.api.api_v1.team_auth import verify_team_token

        bad_token = jwt.encode(
            {
                "team_id": 1,
                "team_name": "Test Team",
                "type": "team_access",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            "wrong-secret",
            algorithm=settings.TEAM_JWT_ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc:
            verify_team_token(bad_token)
        assert exc.value.status_code == 401


# ---------------------------------------------------------------------------
# Integration tests (HTTP layer)
# ---------------------------------------------------------------------------

class TestTeamAuthAPI:
    """Integration tests for team auth endpoints"""

    def test_login_success(self, client_with_mocked_db, mock_db, mock_team):
        """POST /team-auth/login with valid access_code should return a token"""
        with patch("app.api.api_v1.team_auth.crud_team") as mock_crud:
            mock_crud.get_by_access_code = AsyncMock(return_value=mock_team)

            response = client_with_mocked_db.post(
                "/api/rally/v1/team-auth/login",
                json={"access_code": "ABCD-1234"},
            )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["team_id"] == mock_team.id
        assert data["team_name"] == mock_team.name

    def test_login_invalid_code(self, client_with_mocked_db, mock_db):
        """POST /team-auth/login with invalid access_code should return 401"""
        with patch("app.api.api_v1.team_auth.crud_team") as mock_crud:
            mock_crud.get_by_access_code = AsyncMock(return_value=None)

            response = client_with_mocked_db.post(
                "/api/rally/v1/team-auth/login",
                json={"access_code": "WRNG-CODE"},
            )

        assert response.status_code == 401

    def test_login_missing_body(self, client_with_mocked_db):
        """POST /team-auth/login without body should return 422"""
        response = client_with_mocked_db.post("/api/rally/v1/team-auth/login", json={})
        assert response.status_code == 422

    @pytest.mark.parametrize(
        "bad_code",
        ["short", "abcd-1234", "ABCD1234", "ABCD-12345", "A" * 100, "ABCD-123!"],
    )
    def test_login_rejects_malformed_access_code(self, client_with_mocked_db, bad_code):
        """Access codes outside XXXX-XXXX are rejected before the DB lookup."""
        response = client_with_mocked_db.post(
            "/api/rally/v1/team-auth/login",
            json={"access_code": bad_code},
        )
        assert response.status_code == 422

    def test_refresh_with_valid_token(self, client_with_mocked_db, mock_db, mock_team):
        """POST /team-auth/refresh with a valid Bearer token should return a new token"""
        from app.api.api_v1.team_auth import create_team_access_token

        token = create_team_access_token(team_id=mock_team.id, team_name=mock_team.name)

        response = client_with_mocked_db.post(
            "/api/rally/v1/team-auth/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["team_id"] == mock_team.id
        assert data["team_name"] == mock_team.name

    def test_refresh_with_invalid_token(self, client_with_mocked_db):
        """POST /team-auth/refresh with an invalid token should return 401"""
        response = client_with_mocked_db.post(
            "/api/rally/v1/team-auth/refresh",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert response.status_code in [401, 404]

    def test_refresh_without_token(self, client_with_mocked_db):
        """POST /team-auth/refresh without Authorization header should return 401/403"""
        response = client_with_mocked_db.post("/api/rally/v1/team-auth/refresh")
        assert response.status_code in [401, 403, 404, 422]


class TestTokenLifecycleHardening:
    """Session-lifetime and token-integrity guarantees."""

    def _client(self, mock_db):
        app.dependency_overrides[get_db] = lambda: mock_db
        return TestClient(app)

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_refresh_carries_original_login_time(self, mock_db):
        """orig_iat must survive a refresh so the absolute lifetime holds."""
        from app.api.api_v1.team_auth import create_team_access_token

        orig = int((datetime.now(timezone.utc) - timedelta(hours=2)).timestamp())
        token = create_team_access_token(team_id=1, team_name="T", orig_iat=orig)

        response = self._client(mock_db).post(
            "/api/rally/v1/team-auth/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        payload = jwt.decode(
            response.json()["access_token"],
            settings.TEAM_JWT_SECRET_KEY,
            algorithms=["HS256"],
        )
        assert payload["orig_iat"] == orig

    def test_refresh_rejected_beyond_absolute_lifetime(self, mock_db):
        """A token chain older than TEAM_TOKEN_MAX_LIFETIME_HOURS cannot be
        extended — the team must log in again."""
        from app.api.api_v1.team_auth import create_team_access_token

        too_old = int(
            (
                datetime.now(timezone.utc)
                - timedelta(hours=settings.TEAM_TOKEN_MAX_LIFETIME_HOURS + 1)
            ).timestamp()
        )
        token = create_team_access_token(team_id=1, team_name="T", orig_iat=too_old)

        response = self._client(mock_db).post(
            "/api/rally/v1/team-auth/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401
        assert "log in again" in response.json()["detail"].lower()

    def test_verify_accepts_valid_and_rejects_expired(self, mock_db):
        from app.api.api_v1.team_auth import create_team_access_token

        client = self._client(mock_db)
        valid = create_team_access_token(team_id=7, team_name="Sete")
        ok = client.get(
            "/api/rally/v1/team-auth/verify",
            headers={"Authorization": f"Bearer {valid}"},
        )
        assert ok.status_code == 200
        assert ok.json()["team_id"] == 7

        expired = jwt.encode(
            {
                "team_id": 7,
                "team_name": "Sete",
                "type": "team_access",
                "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
            },
            settings.TEAM_JWT_SECRET_KEY,
            algorithm="HS256",
        )
        bad = client.get(
            "/api/rally/v1/team-auth/verify",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert bad.status_code == 401

    def test_verify_rejects_token_signed_with_other_algorithm_key(self, mock_db):
        """A token signed with a different secret must never verify."""
        forged = jwt.encode(
            {
                "team_id": 1,
                "team_name": "Forjada",
                "type": "team_access",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            "attacker-secret",
            algorithm="HS256",
        )
        response = self._client(mock_db).get(
            "/api/rally/v1/team-auth/verify",
            headers={"Authorization": f"Bearer {forged}"},
        )
        assert response.status_code == 401
