from enum import Enum
from typing import Any, Dict, List, Optional, Union

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, SecurityScopes
from pydantic import BaseModel

from app.api.oidc import jwt_validator
from app.core.config import SettingsDep


class ScopeEnum(str, Enum):
    """Permission scope of an authenticated user."""

    ADMIN = "admin"
    MANAGER_RALLY = "manager-rally"
    RALLY_STAFF = "rally-staff"
    RALLY_GUIDE = "rally-guide"
    DEFAULT = "default"


def map_groups_to_scopes(groups: List[str], settings: SettingsDep) -> List[str]:
    """Map authentik group names (``groups`` claim) to rally scopes."""
    scopes: List[str] = []
    if settings.OIDC_ADMIN_GROUP in groups:
        scopes.append(ScopeEnum.ADMIN.value)
    if settings.OIDC_MANAGER_GROUP in groups:
        scopes.append(ScopeEnum.MANAGER_RALLY.value)
    if settings.OIDC_STAFF_GROUP in groups:
        scopes.append(ScopeEnum.RALLY_STAFF.value)
    if settings.OIDC_GUIDE_GROUP in groups:
        scopes.append(ScopeEnum.RALLY_GUIDE.value)
    return scopes


class AuthData(BaseModel):
    # OIDC subject identifier from the provider (stable, unique per user).
    oidc_sub: str
    name: str
    email: Optional[str] = None
    scopes: List[str] = []


def _build_auth_data(claims: Dict[str, Any], settings: SettingsDep) -> AuthData:
    groups = claims.get("groups", []) or []
    name = (
        claims.get("name")
        or claims.get("preferred_username")
        or claims.get("email")
        or "Unknown User"
    )
    return AuthData(
        oidc_sub=claims["sub"],
        name=name,
        email=claims.get("email"),
        scopes=map_groups_to_scopes(groups, settings),
    )


# Bearer schemes. auto_error=False so a missing token yields a 401 (not the
# 403 HTTPBearer raises by default); the optional variant returns None instead.
oauth2_scheme = HTTPBearer(auto_error=False)
oauth2_scheme_optional = HTTPBearer(auto_error=False)


async def api_nei_auth(
    settings: SettingsDep,
    security_scopes: SecurityScopes,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(oauth2_scheme),
) -> AuthData:
    """Dependency for required user authentication (validates an authentik token)."""
    if security_scopes.scopes:
        authenticate_value = f'Bearer scope="{security_scopes.scope_str}"'
    else:
        authenticate_value = "Bearer"

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": authenticate_value},
        )

    claims = await jwt_validator.validate_token(credentials.credentials)
    auth_data = _build_auth_data(claims, settings)

    # Bypass scope checks for admins.
    if ScopeEnum.ADMIN.value in auth_data.scopes:
        return auth_data

    for scope in security_scopes.scopes:
        if scope not in auth_data.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions",
                headers={"WWW-Authenticate": authenticate_value},
            )

    return auth_data


async def api_nei_auth_optional(
    settings: SettingsDep,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(oauth2_scheme_optional),
) -> Optional[AuthData]:
    """Dependency for optional user authentication. Returns None when no/invalid token."""
    if not credentials:
        return None

    try:
        claims = await jwt_validator.validate_token(credentials.credentials)
    except HTTPException:
        return None

    return _build_auth_data(claims, settings)


auth_responses: Dict[Union[int, str], Dict[str, Any]] = {
    401: {"description": "Not authenticated"},
    403: {"description": "Not enough permissions"},
}
