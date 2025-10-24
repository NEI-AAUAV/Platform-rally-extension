from enum import Enum
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, SecurityScopes
from pydantic import BaseModel
from typing import Annotated, Any, Union, Dict, List, Optional, no_type_check
from jose import JWTError, jwt

from app.core.config import SettingsDep


@no_type_check
def get_public_key(settings: SettingsDep) -> str:
    with open(settings.JWT_PUBLIC_KEY_PATH, "r") as file:
        return file.read()


class ScopeEnum(str, Enum):
    """Permission scope of an authenticated user."""

    ADMIN = "admin"
    MANAGER_RALLY = "manager-rally"
    DEFAULT = "default"


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="http://localhost:8000/api/nei/v1/auth/login",
    scopes={
        ScopeEnum.ADMIN: "Full access to everything.",
        ScopeEnum.MANAGER_RALLY: "Edit rally tascas.",
    },
)


class AuthData(BaseModel):
    sub: int
    nmec: Optional[int]
    name: str
    email: str
    surname: str
    scopes: List[str]


async def api_nei_auth(
    settings: SettingsDep,
    public_key: Annotated[str, Depends(get_public_key)],
    security_scopes: SecurityScopes,
    token: str = Depends(oauth2_scheme),
) -> AuthData:
    """Dependency for user authentication"""
    if security_scopes.scopes:
        authenticate_value = f'Bearer scope="{security_scopes.scope_str}"'
    else:
        authenticate_value = "Bearer"

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": authenticate_value},
    )

    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=[settings.JWT_ALGORITHM],
        )
        auth_data = AuthData.model_validate(payload)
    except JWTError:
        raise credentials_exception

    # Bypass scopes for admin
    if ScopeEnum.ADMIN in auth_data.scopes:
        return auth_data

    # Verify that the token has all the necessary scopes
    for scope in security_scopes.scopes:
        if scope not in auth_data.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions",
                headers={"WWW-Authenticate": authenticate_value},
            )

    return auth_data


auth_responses: Dict[Union[int, str], Dict[str, Any]] = {
    401: {"description": "Not authenticated"},
    403: {"description": "Not enough permissions"},
}
