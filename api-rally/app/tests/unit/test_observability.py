"""Tests for optional Sentry init gating and header scrubbing."""

import builtins
import sys
from types import ModuleType
from unittest.mock import MagicMock

import pytest

from app.core import observability
from app.core.config import settings


def test_init_sentry_noop_without_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SENTRY_DSN", None)
    # Must not raise even though sentry-sdk may be absent.
    observability.init_sentry()


def test_init_sentry_warns_when_sdk_not_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SENTRY_DSN", "https://example.invalid/1")
    monkeypatch.delitem(sys.modules, "sentry_sdk", raising=False)

    real_import = builtins.__import__

    def _fake_import(name, *args, **kwargs):
        if name == "sentry_sdk":
            raise ImportError("no sentry_sdk")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _fake_import)

    # Must not raise; logs a warning and returns.
    observability.init_sentry()


def test_init_sentry_initialises_when_dsn_and_sdk_present(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SENTRY_DSN", "https://example.invalid/1")

    fake_sentry_sdk = ModuleType("sentry_sdk")
    fake_sentry_sdk.init = MagicMock()
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake_sentry_sdk)

    observability.init_sentry()

    fake_sentry_sdk.init.assert_called_once()
    _, kwargs = fake_sentry_sdk.init.call_args
    assert kwargs["dsn"] == "https://example.invalid/1"
    assert kwargs["send_default_pii"] is False
    assert kwargs["before_send"] is observability._scrub_sensitive


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
