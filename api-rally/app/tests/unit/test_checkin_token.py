"""Unit tests for HMAC check-in token generation and verification."""

import time

import pytest

from app.core.config import settings
from app.services import checkin_token
from app.services.checkin_token import CheckinTokenError, verify_checkin_token


@pytest.fixture(autouse=True)
def _signing_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "CHECKIN_HMAC_SECRET", "test-checkin-secret")
    monkeypatch.setattr(settings, "CHECKIN_TOKEN_TTL_SECONDS", 90)


def test_round_trip_returns_claims() -> None:
    token = checkin_token.generate_checkin_token(42)
    claims = verify_checkin_token(token)

    assert claims.checkpoint_id == 42
    assert claims.nonce
    assert abs(claims.issued_at - int(time.time())) < 5


def test_each_token_has_a_fresh_nonce() -> None:
    a = verify_checkin_token(checkin_token.generate_checkin_token(1))
    b = verify_checkin_token(checkin_token.generate_checkin_token(1))
    assert a.nonce != b.nonce


def test_tampered_signature_is_rejected() -> None:
    token = checkin_token.generate_checkin_token(42)
    payload, sig = token.rsplit(".", 1)
    forged = f"{payload}.{'0' * len(sig)}"
    with pytest.raises(CheckinTokenError):
        verify_checkin_token(forged)


def test_tampered_payload_is_rejected() -> None:
    # Re-sign nothing: change the checkpoint id in the payload, keep old sig.
    token = checkin_token.generate_checkin_token(42)
    other = checkin_token.generate_checkin_token(99)
    payload_42 = token.rsplit(".", 1)[0]
    sig_99 = other.rsplit(".", 1)[1]
    with pytest.raises(CheckinTokenError):
        verify_checkin_token(f"{payload_42}.{sig_99}")


def test_expired_token_is_rejected() -> None:
    token = checkin_token.generate_checkin_token(42)
    # Verify 200s in the future; TTL is 90s.
    future_time = int(time.time()) + 200
    with pytest.raises(CheckinTokenError, match="expired"):
        verify_checkin_token(token, now=future_time)


def test_future_token_is_rejected() -> None:
    token = checkin_token.generate_checkin_token(42)
    past_time = int(time.time()) - 60
    with pytest.raises(CheckinTokenError, match="not yet valid"):
        verify_checkin_token(token, now=past_time)


@pytest.mark.parametrize("bad", ["", "no-dot", "not!base64.deadbeef", "a.b.c.d"])
def test_malformed_tokens_are_rejected(bad: str) -> None:
    with pytest.raises(CheckinTokenError):
        verify_checkin_token(bad)


def test_different_secret_fails_verification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = checkin_token.generate_checkin_token(42)
    monkeypatch.setattr(settings, "CHECKIN_HMAC_SECRET", "a-different-secret")
    with pytest.raises(CheckinTokenError):
        verify_checkin_token(token)


def test_falls_back_to_team_jwt_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "CHECKIN_HMAC_SECRET", None)
    monkeypatch.setattr(settings, "TEAM_JWT_SECRET_KEY", "jwt-fallback-secret")
    token = checkin_token.generate_checkin_token(7)
    assert verify_checkin_token(token).checkpoint_id == 7
