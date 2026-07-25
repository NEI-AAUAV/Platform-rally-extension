"""HMAC-signed, short-lived check-in tokens.

A checkpoint displays a rotating QR encoding one of these tokens. A team scans
it to check itself into that checkpoint. The token is signed with a server
secret and carries an issue time, so a forged or stale QR is rejected; a random
nonce lets the caller guard against replay (see the check-in endpoint).

Token format: ``urlsafe_b64(checkpoint_id.issued_at.nonce) + "." + hex_hmac``.
The signature covers the *raw* payload, so re-encoding cannot change the signed
bytes.
"""

import base64
import hmac
import logging
import secrets
import time
from dataclasses import dataclass
from hashlib import sha256

from app.core.config import settings

logger = logging.getLogger(__name__)

# Small tolerance for clock skew between the QR-issuing and verifying clocks.
_CLOCK_SKEW_SECONDS = 5


class CheckinTokenError(Exception):
    """Raised when a check-in token is malformed, forged or expired."""


@dataclass(frozen=True)
class CheckinClaims:
    """The verified contents of a check-in token."""

    checkpoint_id: int
    issued_at: int
    nonce: str


def _secret() -> bytes:
    secret = settings.CHECKIN_HMAC_SECRET or settings.TEAM_JWT_SECRET_KEY
    if not secret:
        raise CheckinTokenError("No check-in signing secret configured")
    return secret.encode()


def _sign(message: str) -> str:
    return hmac.new(_secret(), message.encode(), sha256).hexdigest()


def generate_checkin_token(checkpoint_id: int) -> str:
    """Mint a fresh signed token for a checkpoint (call per QR render)."""
    issued_at = int(time.time())
    nonce = secrets.token_urlsafe(8)
    message = f"{checkpoint_id}.{issued_at}.{nonce}"
    payload = base64.urlsafe_b64encode(message.encode()).decode().rstrip("=")
    return f"{payload}.{_sign(message)}"


def verify_checkin_token(token: str, *, now: int | None = None) -> CheckinClaims:
    """Verify a token's signature and freshness, returning its claims.

    Raises CheckinTokenError on any malformed, forged, future or expired token.
    Signature is compared in constant time.
    """
    current = int(time.time()) if now is None else now
    try:
        payload, signature = token.rsplit(".", 1)
        padded = payload + "=" * (-len(payload) % 4)
        message = base64.urlsafe_b64decode(padded.encode()).decode()
        checkpoint_str, issued_str, _nonce = message.split(".")
        checkpoint_id = int(checkpoint_str)
        issued_at = int(issued_str)
    except ValueError as exc:
        # Covers bad base64, bad unicode, wrong field count and non-int fields.
        raise CheckinTokenError("Malformed check-in token") from exc

    if not hmac.compare_digest(_sign(message), signature):
        raise CheckinTokenError("Invalid check-in token signature")

    if issued_at > current + _CLOCK_SKEW_SECONDS:
        raise CheckinTokenError("Check-in token is not yet valid")
    if current - issued_at > settings.CHECKIN_TOKEN_TTL_SECONDS:
        raise CheckinTokenError("Check-in token has expired")

    return CheckinClaims(checkpoint_id=checkpoint_id, issued_at=issued_at, nonce=_nonce)
