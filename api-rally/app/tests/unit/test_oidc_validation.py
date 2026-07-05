"""Unit tests for OIDC token validation hardening (app.api.oidc).

Covers algorithm pinning (alg-confusion defence) and JWKS caching. Uses a
locally generated RSA keypair so no real provider is contacted.
"""

from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from authlib.jose import JsonWebKey, JsonWebToken
from fastapi import HTTPException

from app.api.oidc import OIDCJWTValidator
from app.core.config import settings

_ISSUER = "https://issuer.example"
_CLIENT_ID = "rally-client"

# One RSA key shared across the module.
_key = JsonWebKey.generate_key("RSA", 2048, is_private=True)
_jwks = {"keys": [_key.as_dict(is_private=False, kid="k1")]}


def _sign(alg: str, **claims) -> str:
    payload = {"iss": _ISSUER, "aud": _CLIENT_ID, "exp": 9999999999, **claims}
    header = {"alg": alg, "kid": "k1"}
    token = JsonWebToken([alg]).encode(header, payload, _key)
    return token.decode() if isinstance(token, bytes) else token


@contextmanager
def _wired_validator(jwks_calls: list[int] | None = None):
    """A validator with config/discovery stubbed and JWKS fetch instrumented."""
    v = OIDCJWTValidator()
    v._jwks_uri = "https://issuer.example/jwks"
    v._issuer = _ISSUER

    async def fake_get(uri, timeout=10.0):
        if jwks_calls is not None:
            jwks_calls.append(1)
        resp = AsyncMock()
        resp.raise_for_status = lambda: None
        resp.json = lambda: _jwks
        return resp

    client = AsyncMock()
    client.get = fake_get
    client.__aenter__.return_value = client
    with patch.object(settings, "OIDC_CLIENT_ID", _CLIENT_ID), \
         patch.object(settings, "OIDC_ALLOWED_ALGORITHMS", ["RS256"]), \
         patch("app.api.oidc.httpx.AsyncClient", return_value=client), \
         patch("app.api.oidc._jwt", JsonWebToken(["RS256"])):
        yield v


@pytest.mark.asyncio
async def test_valid_rs256_token_accepted():
    with _wired_validator() as v:
        claims = await v.validate_token(_sign("RS256", sub="u1"))
    assert claims["sub"] == "u1"


@pytest.mark.asyncio
async def test_hs256_token_rejected_alg_confusion():
    """A token whose header alg is outside the allowlist must be rejected."""
    # Attacker forges an HS256 token (symmetric) hoping the resource server
    # accepts it. The pinned RS256-only decoder must refuse it on algorithm.
    hs = JsonWebToken(["HS256"]).encode(
        {"alg": "HS256", "kid": "k1"},
        {"iss": _ISSUER, "aud": _CLIENT_ID, "exp": 9999999999, "sub": "attacker"},
        "attacker-guessed-secret",
    )
    hs_token = hs.decode() if isinstance(hs, bytes) else hs
    with _wired_validator() as v:
        call = v.validate_token(hs_token)
        with pytest.raises(HTTPException):
            await call


@pytest.mark.asyncio
async def test_jwks_cached_across_validations():
    """JWKS is fetched once for two validations within the cache TTL."""
    calls: list[int] = []
    with patch.object(settings, "OIDC_JWKS_CACHE_TTL_SECONDS", 600):
        with _wired_validator(jwks_calls=calls) as v:
            await v.validate_token(_sign("RS256", sub="a"))
            await v.validate_token(_sign("RS256", sub="b"))
    assert len(calls) == 1
