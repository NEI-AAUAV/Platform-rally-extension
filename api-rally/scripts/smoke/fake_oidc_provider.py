"""Minimal local OIDC provider for the smoke test stack.

Serves the two endpoints api-rally's OIDCJWTValidator needs (discovery doc +
JWKS) and mints RS256 access tokens signed with a locally generated keypair.
This stands in for Authentik so the smoke suite can exercise the *real*
JWT-validation code path (signature, issuer, audience, algorithm pinning)
against a real running api-rally + Postgres, without depending on a live
identity provider.

Run standalone: `python fake_oidc_provider.py` (binds 0.0.0.0:9009).
Mint a token for other scripts: `from fake_oidc_provider import mint_token`.
"""

import time
import uuid
from typing import Any

import uvicorn
from authlib.jose import JsonWebKey, jwt
from fastapi import FastAPI
from pydantic import BaseModel

ISSUER = "http://fake-oidc:9009"
CLIENT_ID = "rally-smoke-client"
APPLICATION_SLUG = "rally"

_key = JsonWebKey.generate_key("RSA", 2048, is_private=True)
_kid = str(uuid.uuid4())
_private_jwk = _key.as_dict(is_private=True)
_private_jwk["kid"] = _kid
_public_jwk = _key.as_dict(is_private=False)
_public_jwk["kid"] = _kid
_public_jwk["alg"] = "RS256"
_public_jwk["use"] = "sig"

app = FastAPI(title="fake-oidc-provider")


@app.get(f"/application/o/{APPLICATION_SLUG}/.well-known/openid-configuration")
def discovery() -> dict[str, Any]:
    return {
        "issuer": ISSUER,
        "jwks_uri": f"{ISSUER}/jwks",
        "authorization_endpoint": f"{ISSUER}/authorize",
        "token_endpoint": f"{ISSUER}/token",
    }


@app.get("/jwks")
def jwks() -> dict[str, Any]:
    return {"keys": [_public_jwk]}


def mint_token(*, sub: str, name: str, groups: list[str], email: str | None = None) -> str:
    """Mint an RS256 access token this provider's JWKS can validate.

    Only valid for tokens minted by *this process's* keypair — calling this
    from a different process (e.g. importing the module in another
    container) generates an unrelated key and signs tokens the running
    provider's /jwks can never validate. Other processes must use the
    provider's HTTP /mint endpoint instead, so signing always happens with
    the one keypair actually being served.
    """
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": CLIENT_ID,
        "sub": sub,
        "name": name,
        "email": email,
        "groups": groups,
        "iat": now,
        "exp": now + 3600,
    }
    header = {"alg": "RS256", "kid": _kid}
    token = jwt.encode(header, claims, _private_jwk)
    return token.decode("utf-8") if isinstance(token, bytes) else token


class MintRequest(BaseModel):
    sub: str
    name: str
    groups: list[str]
    email: str | None = None


@app.post("/mint")
def mint(body: MintRequest) -> dict[str, str]:
    """HTTP mint endpoint — the only safe way for another process/container
    to get a token signed by *this* provider's keypair (see mint_token)."""
    token = mint_token(sub=body.sub, name=body.name, groups=body.groups, email=body.email)
    return {"access_token": token}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9009)
