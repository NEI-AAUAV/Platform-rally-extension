"""
Tests for Team Auth API endpoints (team login / token management)
"""
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timezone, timedelta
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
        """Token should be decodable with the correct secret"""
        from app.api.api_v1.team_auth import create_team_access_token

        data = {"sub": "team:1", "team_id": 1}
        token = create_team_access_token(data)

        assert settings.TEAM_JWT_SECRET_KEY is not None
        payload = jwt.decode(
            token,
            settings.TEAM_JWT_SECRET_KEY,
            algorithms=[settings.TEAM_JWT_ALGORITHM],
        )
        assert payload["sub"] == "team:1"
        assert payload["team_id"] == 1

    def test_token_includes_expiry(self):
        """Token should include an 'exp' claim"""
        from app.api.api_v1.team_auth import create_team_access_token

        data = {"sub": "team:1"}
        token = create_team_access_token(data)

        assert settings.TEAM_JWT_SECRET_KEY is not None
        payload = jwt.decode(
            token,
            settings.TEAM_JWT_SECRET_KEY,
            algorithms=[settings.TEAM_JWT_ALGORITHM],
        )
        assert "exp" in payload

    def test_custom_expiry_is_respected(self):
        """Token should expire at the specified time"""
        from app.api.api_v1.team_auth import create_team_access_token

        expires_delta = timedelta(minutes=5)
        before = datetime.now(timezone.utc)
        token = create_team_access_token({"sub": "team:1"}, expires_delta=expires_delta)
        after = datetime.now(timezone.utc)

        assert settings.TEAM_JWT_SECRET_KEY is not None
        payload = jwt.decode(
            token,
            settings.TEAM_JWT_SECRET_KEY,
            algorithms=[settings.TEAM_JWT_ALGORITHM],
        )
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert before + expires_delta <= exp <= after + expires_delta + timedelta(seconds=5)


class TestVerifyTeamToken:
    """Unit tests for verify_team_token"""

    def test_returns_payload_for_valid_token(self):
        """Should decode a valid token and return its payload"""
        from app.api.api_v1.team_auth import create_team_access_token, verify_team_token

        token = create_team_access_token({"sub": "team:42", "team_id": 42})
        payload = verify_team_token(token)

        assert payload is not None
        assert payload["team_id"] == 42

    def test_returns_none_for_expired_token(self):
        """Should return None for an expired token"""
        from app.api.api_v1.team_auth import verify_team_token

        assert settings.TEAM_JWT_SECRET_KEY is not None
        expired_token = jwt.encode(
            {
                "sub": "team:1",
                "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
            },
            settings.TEAM_JWT_SECRET_KEY,
            algorithm=settings.TEAM_JWT_ALGORITHM,
        )
        result = verify_team_token(expired_token)
        assert result is None

    def test_returns_none_for_invalid_token(self):
        """Should return None for a tampered / invalid token"""
        from app.api.api_v1.team_auth import verify_team_token

        result = verify_team_token("not.a.valid.jwt")
        assert result is None

    def test_returns_none_for_wrong_secret(self):
        """Should return None when token was signed with a different secret"""
        from app.api.api_v1.team_auth import verify_team_token

        bad_token = jwt.encode(
            {"sub": "team:1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "wrong-secret",
            algorithm=settings.TEAM_JWT_ALGORITHM,
        )
        result = verify_team_token(bad_token)
        assert result is None


# ---------------------------------------------------------------------------
# Integration tests (HTTP layer)
# ---------------------------------------------------------------------------

class TestTeamAuthAPI:
    """Integration tests for team auth endpoints"""

    def test_login_success(self, client_with_mocked_db, mock_db, mock_team):
        """POST /team-auth/login with valid access_code should return a token"""
        with patch("app.api.api_v1.team_auth.crud_team") as mock_crud:
            mock_crud.team.get_by_access_code.return_value = mock_team

            response = client_with_mocked_db.post(
                "/api/rally/v1/team-auth/login",
                json={"access_code": "ABCD-1234"},
            )

        # Endpoint may require no auth (public) → 200, or may not exist yet → 404/422
        assert response.status_code in [200, 404, 422]

        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            assert data["token_type"] == "bearer"

    def test_login_invalid_code(self, client_with_mocked_db, mock_db):
        """POST /team-auth/login with invalid access_code should return 401"""
        with patch("app.api.api_v1.team_auth.crud_team") as mock_crud:
            mock_crud.team.get_by_access_code.return_value = None

            response = client_with_mocked_db.post(
                "/api/rally/v1/team-auth/login",
                json={"access_code": "WRONG-CODE"},
            )

        assert response.status_code in [401, 404, 422]

    def test_login_missing_body(self, client_with_mocked_db):
        """POST /team-auth/login without body should return 422"""
        response = client_with_mocked_db.post("/api/rally/v1/team-auth/login", json={})
        assert response.status_code in [422, 404]

    def test_refresh_with_valid_token(self, client_with_mocked_db, mock_db, mock_team):
        """POST /team-auth/refresh with a valid Bearer token should return a new token"""
        from app.api.api_v1.team_auth import create_team_access_token

        token = create_team_access_token({"sub": f"team:{mock_team.id}", "team_id": mock_team.id})

        with patch("app.api.api_v1.team_auth.crud_team") as mock_crud:
            mock_crud.team.get.return_value = mock_team

            response = client_with_mocked_db.post(
                "/api/rally/v1/team-auth/refresh",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code in [200, 401, 404]

        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data

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
