"""
OIDC JWT token validation (provider-agnostic).

Rally is a OIDC resource server. It validates access tokens issued by the
identity provider (Authentik) using authlib, with automatic OIDC discovery and
JWKS fetching. It never mints its own tokens.

Ported from the nei-gamification-system api-game auth module.
"""

import time
from typing import Any

import httpx
from authlib.jose import JsonWebToken
from authlib.jose.errors import JoseError
from fastapi import HTTPException, status

from app.core.config import Settings, settings

# Pin the accepted JWS algorithms at the decoder level so a token cannot
# dictate its own algorithm (alg-confusion / "none" defence). authlib rejects
# any token whose header alg is outside this allowlist.
# This must stay module-level (bound at import time from the global settings),
# since JsonWebToken itself is not per-request state.
_jwt = JsonWebToken(settings.OIDC_ALLOWED_ALGORITHMS)


class OIDCJWTValidator:
    """Validate provider-issued JWT access tokens via OIDC discovery + JWKS."""

    def __init__(self) -> None:
        self._jwks_uri: str | None = None
        self._issuer: str | None = None
        self._jwks: dict[str, Any] | None = None
        self._jwks_fetched_at: float = 0.0

    async def _get_oidc_config(self, settings: Settings) -> dict[str, Any]:
        """Fetch (and cache) the OIDC discovery document.

        The expected issuer is normalised once here (docker→localhost) so the
        hot validation path compares against a ready value.
        """
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
            self._issuer = oidc_config["issuer"].replace("host.docker.internal", "localhost")
            return dict(oidc_config)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to fetch OIDC configuration: {str(e)}",
            ) from e

    async def _get_jwks(
        self, jwks_uri: str, settings: Settings, force_refresh: bool = False
    ) -> dict[str, Any]:
        """Return the provider JWKS, cached for OIDC_JWKS_CACHE_TTL_SECONDS.

        Refetched when the cache is empty, expired, or a caller forces refresh
        (e.g. after an unknown-key verification failure — key rotation).
        """
        ttl = settings.OIDC_JWKS_CACHE_TTL_SECONDS
        fresh = (time.monotonic() - self._jwks_fetched_at) < ttl
        if self._jwks is not None and fresh and not force_refresh:
            return self._jwks

        async with httpx.AsyncClient() as client:
            jwks_response = await client.get(jwks_uri, timeout=10.0)
            jwks_response.raise_for_status()
            self._jwks = jwks_response.json()
            self._jwks_fetched_at = time.monotonic()
        assert self._jwks is not None
        return self._jwks

    async def validate_token(self, token: str, settings: Settings) -> dict[str, Any]:
        """Validate a JWT access token and return its decoded claims.

        Verifies the signature against the (cached) provider JWKS using a
        pinned algorithm allowlist, then the issuer and audience (must contain
        OIDC_CLIENT_ID). On a key-not-found error the JWKS is refreshed once to
        tolerate provider key rotation.
        """
        try:
            oidc_config = await self._get_oidc_config(settings)
            jwks = await self._get_jwks(oidc_config["jwks_uri"], settings)

            try:
                claims = _jwt.decode(token, jwks)
            except JoseError:
                # Possible key rotation: refresh JWKS once and retry.
                jwks = await self._get_jwks(oidc_config["jwks_uri"], settings, force_refresh=True)
                claims = _jwt.decode(token, jwks)
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
            ) from e
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token validation failed: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            ) from e


# Global instance (JWKS/issuer cached after first call).
jwt_validator = OIDCJWTValidator()
