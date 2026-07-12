"""Tests for optional Sentry init gating and header scrubbing."""

import pytest

from app.core import observability
from app.core.config import settings


def test_init_sentry_noop_without_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SENTRY_DSN", None)
    # Must not raise even though sentry-sdk may be absent.
    observability.init_sentry()


def test_scrub_removes_sensitive_headers() -> None:
    event = {
        "request": {
            "headers": {
                "Authorization": "Bearer secret",
                "Cookie": "session=abc",
                "X-Request-ID": "trace-1",
                "User-Agent": "pytest",
            }
        }
    }
    scrubbed = observability._scrub_sensitive(event, {})
    headers = scrubbed["request"]["headers"]
    assert headers["Authorization"] == "[scrubbed]"
    assert headers["Cookie"] == "[scrubbed]"
    assert headers["X-Request-ID"] == "[scrubbed]"
    # Non-sensitive headers pass through untouched.
    assert headers["User-Agent"] == "pytest"


def test_scrub_handles_missing_headers() -> None:
    assert observability._scrub_sensitive({}, {}) == {}
