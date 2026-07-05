"""
Critical authentication tests for the OIDC resource-server model.

Rally validates authentik-issued access tokens (no token minting). These tests
exercise the claim→AuthData mapping, group→scope mapping, admin bypass and
scope enforcement, with the JWKS/token validator mocked.
"""
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException

from app.api.auth import (
    AuthData,
    ScopeEnum,
    _build_auth_data,
    api_nei_auth,
    api_nei_auth_optional,
    map_groups_to_scopes,
)
from app.core.config import Settings


@pytest.fixture
def settings():
    """Settings stub with the default group names."""
    s = Mock(spec=Settings)
    s.OIDC_ADMIN_GROUP = "admin"
    s.OIDC_MANAGER_GROUP = "manager-rally"
    s.OIDC_STAFF_GROUP = "rally-staff"
    s.OIDC_GUIDE_GROUP = "rally-guide"
    return s


@pytest.fixture
def credentials():
    cred = Mock()
    cred.credentials = "mock.access.token"
    return cred


def _scopes_obj(scopes):
    obj = Mock()
    obj.scopes = scopes
    obj.scope_str = " ".join(scopes)
    return obj


class TestAuthData:
    def test_auth_data_creation(self):
        auth_data = AuthData(
            oidc_sub="abc-123",
            name="Test User",
            email="test@example.com",
            scopes=["rally-staff"],
        )
        assert auth_data.oidc_sub == "abc-123"
        assert auth_data.name == "Test User"
        assert auth_data.email == "test@example.com"
        assert auth_data.scopes == ["rally-staff"]

    def test_auth_data_defaults(self):
        auth_data = AuthData(oidc_sub="abc-123", name="Test")
        assert auth_data.email is None
        assert auth_data.scopes == []


class TestGroupToScopeMapping:
    def test_admin_group_maps_to_admin_scope(self, settings):
        assert map_groups_to_scopes(["admin"], settings) == [ScopeEnum.ADMIN.value]

    def test_manager_and_staff(self, settings):
        scopes = map_groups_to_scopes(["manager-rally", "rally-staff"], settings)
        assert ScopeEnum.MANAGER_RALLY.value in scopes
        assert ScopeEnum.RALLY_STAFF.value in scopes

    def test_unknown_group_ignored(self, settings):
        assert map_groups_to_scopes(["some-other-group"], settings) == []

    def test_build_auth_data_from_claims(self, settings):
        claims = {
            "sub": "uuid-1",
            "name": "Jane",
            "email": "jane@example.com",
            "groups": ["rally-staff"],
        }
        auth = _build_auth_data(claims, settings)
        assert auth.oidc_sub == "uuid-1"
        assert auth.name == "Jane"
        assert auth.scopes == [ScopeEnum.RALLY_STAFF.value]

    def test_build_auth_data_name_fallback(self, settings):
        claims = {"sub": "uuid-2", "preferred_username": "jdoe", "groups": []}
        auth = _build_auth_data(claims, settings)
        assert auth.name == "jdoe"


@pytest.mark.asyncio
class TestApiNeiAuth:
    async def test_success_no_scopes_required(self, settings, credentials):
        claims = {"sub": "uuid-1", "name": "Jane", "email": "j@x.pt", "groups": ["rally-staff"]}
        with patch("app.api.auth.jwt_validator.validate_token", new=AsyncMock(return_value=claims)):
            result = await api_nei_auth(
                settings=settings,
                security_scopes=_scopes_obj([]),
                credentials=credentials,
            )
        assert isinstance(result, AuthData)
        assert result.oidc_sub == "uuid-1"
        assert result.scopes == [ScopeEnum.RALLY_STAFF.value]

    async def test_admin_bypasses_scope_check(self, settings, credentials):
        claims = {"sub": "uuid-a", "name": "Boss", "groups": ["admin"]}
        with patch("app.api.auth.jwt_validator.validate_token", new=AsyncMock(return_value=claims)):
            result = await api_nei_auth(
                settings=settings,
                security_scopes=_scopes_obj(["manager-rally"]),
                credentials=credentials,
            )
        assert ScopeEnum.ADMIN.value in result.scopes

    async def test_missing_required_scope_raises_403(self, settings, credentials):
        claims = {"sub": "uuid-s", "name": "Staffer", "groups": ["rally-staff"]}
        with patch("app.api.auth.jwt_validator.validate_token", new=AsyncMock(return_value=claims)):
            call = api_nei_auth(
                settings=settings,
                security_scopes=_scopes_obj(["manager-rally"]),
                credentials=credentials,
            )
            with pytest.raises(HTTPException) as exc:
                await call
        assert exc.value.status_code == 403

    async def test_invalid_token_propagates(self, settings, credentials):
        with patch(
            "app.api.auth.jwt_validator.validate_token",
            new=AsyncMock(side_effect=HTTPException(status_code=401, detail="bad")),
        ):
            call = api_nei_auth(
                settings=settings,
                security_scopes=_scopes_obj([]),
                credentials=credentials,
            )
            with pytest.raises(HTTPException) as exc:
                await call
        assert exc.value.status_code == 401


@pytest.mark.asyncio
class TestApiNeiAuthOptional:
    async def test_no_credentials_returns_none(self, settings):
        result = await api_nei_auth_optional(settings=settings, credentials=None)
        assert result is None

    async def test_invalid_token_returns_none(self, settings, credentials):
        with patch(
            "app.api.auth.jwt_validator.validate_token",
            new=AsyncMock(side_effect=HTTPException(status_code=401, detail="bad")),
        ):
            result = await api_nei_auth_optional(settings=settings, credentials=credentials)
        assert result is None

    async def test_valid_token_returns_auth_data(self, settings, credentials):
        claims = {"sub": "uuid-1", "name": "Jane", "groups": ["admin"]}
        with patch("app.api.auth.jwt_validator.validate_token", new=AsyncMock(return_value=claims)):
            result = await api_nei_auth_optional(settings=settings, credentials=credentials)
        assert result is not None
        assert result.oidc_sub == "uuid-1"
