"""
OIDC JWT token validation (provider-agnostic).

Rally is a OIDC resource server. It validates access tokens issued by the
identity provider (Authentik) using authlib, with automatic OIDC discovery and
JWKS fetching. It never mints its own tokens.

Ported from the nei-gamification-system api-game auth module.
"""

from typing import Any, Dict

import httpx
from authlib.jose import jwt
from authlib.jose.errors import JoseError
from fastapi import HTTPException, status

from app.core.config import settings


class OIDCJWTValidator:
    """Validate provider-issued JWT access tokens via OIDC discovery + JWKS."""

    def __init__(self) -> None:
        self._jwks_uri: str | None = None
        self._issuer: str | None = None

    async def _get_oidc_config(self) -> Dict[str, Any]:
        """Fetch (and cache) the OIDC discovery document."""
        if self._jwks_uri and self._issuer:
            return {"jwks_uri": self._jwks_uri, "issuer": self._issuer}

        discovery_url = (
            f"{settings.OIDC_PROVIDER_URL}/application/o/"
            f"{settings.OIDC_APPLICATION_SLUG}/.well-known/openid-configuration"
        )
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(discovery_url, timeout=10.0)
                response.raise_for_status()
                oidc_config = response.json()

            self._jwks_uri = oidc_config["jwks_uri"]
            self._issuer = oidc_config["issuer"]
            return oidc_config
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to fetch OIDC configuration: {str(e)}",
            )

    async def validate_token(self, token: str) -> Dict[str, Any]:
        """Validate a JWT access token and return its decoded claims.

        Verifies the signature against the provider JWKS, the issuer, and the
        audience (must contain OIDC_CLIENT_ID).
        """
        try:
            oidc_config = await self._get_oidc_config()

            async with httpx.AsyncClient() as client:
                jwks_response = await client.get(oidc_config["jwks_uri"], timeout=10.0)
                jwks_response.raise_for_status()
                jwks = jwks_response.json()

            claims = jwt.decode(token, jwks)
            claims.validate()

            if claims.get("iss") != self._issuer:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token issuer",
                )

            aud = claims.get("aud")
            if isinstance(aud, list):
                if settings.OIDC_CLIENT_ID not in aud:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid token audience",
                    )
            elif aud != settings.OIDC_CLIENT_ID:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token audience",
                )

            return dict(claims)

        except HTTPException:
            raise
        except JoseError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token validation failed: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )


# Global instance (JWKS/issuer cached after first call).
jwt_validator = OIDCJWTValidator()
