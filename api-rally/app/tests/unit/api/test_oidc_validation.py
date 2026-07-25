"""Unit tests for OIDC token validation hardening (app.api.oidc).

Covers algorithm pinning (alg-confusion defence) and JWKS caching. Uses a
locally generated RSA keypair so no real provider is contacted.
"""

from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import anyio
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

    async def fake_get(uri, *args, **kwargs):
        if jwks_calls is not None:
            jwks_calls.append(1)
        resp = AsyncMock()
        resp.raise_for_status = lambda: None
        resp.json = lambda: _jwks
        async with anyio.fail_after(10.0):
            return resp

    client = AsyncMock()
    client.get = fake_get
    client.__aenter__.return_value = client
    with (
        patch.object(settings, "OIDC_CLIENT_ID", _CLIENT_ID),
        patch.object(settings, "OIDC_ALLOWED_ALGORITHMS", ["RS256"]),
        patch("app.api.oidc.httpx.AsyncClient", return_value=client),
        patch("app.api.oidc._jwt", JsonWebToken(["RS256"])),
    ):
        yield v


@pytest.mark.asyncio
async def test_valid_rs256_token_accepted():
    with _wired_validator() as v:
        claims = await v.validate_token(_sign("RS256", sub="u1"), settings)
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
        call = v.validate_token(hs_token, settings)
        with pytest.raises(HTTPException):
            await call


@pytest.mark.asyncio
async def test_jwks_cached_across_validations():
    """JWKS is fetched once for two validations within the cache TTL."""
    calls: list[int] = []
    with patch.object(settings, "OIDC_JWKS_CACHE_TTL_SECONDS", 600):
        with _wired_validator(jwks_calls=calls) as v:
            await v.validate_token(_sign("RS256", sub="a"), settings)
            await v.validate_token(_sign("RS256", sub="b"), settings)
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_wrong_issuer_rejected():
    token = _sign("RS256", sub="u1")
    with _wired_validator() as v:
        v._issuer = "https://different-issuer.example"
        with pytest.raises(HTTPException) as exc:
            await v.validate_token(token, settings)
    assert exc.value.status_code == 401
    assert "issuer" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_audience_list_missing_client_id_rejected():
    token = _sign("RS256", sub="u1", aud=["other-client"])
    with _wired_validator() as v, pytest.raises(HTTPException) as exc:
        await v.validate_token(token, settings)
    assert exc.value.status_code == 401
    assert "audience" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_audience_list_with_client_id_accepted():
    token = _sign("RS256", sub="u1", aud=["other-client", _CLIENT_ID])
    with _wired_validator() as v:
        claims = await v.validate_token(token, settings)
    assert claims["sub"] == "u1"


@pytest.mark.asyncio
async def test_scalar_audience_mismatch_rejected():
    token = _sign("RS256", sub="u1", aud="someone-else")
    with _wired_validator() as v, pytest.raises(HTTPException) as exc:
        await v.validate_token(token, settings)
    assert exc.value.status_code == 401
    assert "audience" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_unexpected_error_wrapped_as_401():
    """A non-Jose, non-HTTPException failure mid-validation still surfaces as
    a 401 rather than leaking a raw exception."""
    token = _sign("RS256", sub="u1")
    with _wired_validator() as v:
        with patch("app.api.oidc._jwt.decode", side_effect=RuntimeError("boom")):
            with pytest.raises(HTTPException) as exc:
                await v.validate_token(token, settings)
    assert exc.value.status_code == 401
    assert "validation failed" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_get_oidc_config_success_populates_cache():
    v = OIDCJWTValidator()
    discovery = {
        "jwks_uri": "https://issuer.example/jwks",
        "issuer": "https://host.docker.internal/app",
    }
    resp = AsyncMock()
    resp.raise_for_status = lambda: None
    resp.json = lambda: discovery

    client = AsyncMock()
    client.get = AsyncMock(return_value=resp)
    client.__aenter__.return_value = client
    with (
        patch.object(settings, "OIDC_PROVIDER_URL", "https://issuer.example"),
        patch.object(settings, "OIDC_APPLICATION_SLUG", "rally"),
        patch("app.api.oidc.httpx.AsyncClient", return_value=client),
    ):
        result = await v._get_oidc_config(settings)

    assert result["jwks_uri"] == discovery["jwks_uri"]
    # host.docker.internal normalised to localhost for the hot comparison path.
    assert v._issuer == "https://localhost/app"


@pytest.mark.asyncio
async def test_get_oidc_config_failure_raises_503():
    v = OIDCJWTValidator()
    client = AsyncMock()
    client.get = AsyncMock(side_effect=RuntimeError("network down"))
    client.__aenter__.return_value = client
    with (
        patch.object(settings, "OIDC_PROVIDER_URL", "https://issuer.example"),
        patch.object(settings, "OIDC_APPLICATION_SLUG", "rally"),
        patch("app.api.oidc.httpx.AsyncClient", return_value=client),
    ):
        with pytest.raises(HTTPException) as exc:
            await v._get_oidc_config(settings)
    assert exc.value.status_code == 503
