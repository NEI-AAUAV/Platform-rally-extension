"""Unit tests for the pure validator/helper functions in app.core.config."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings, split_comma_list


def test_split_comma_list_splits_and_strips():
    assert split_comma_list("a, b ,c") == ["a", "b", "c"]


def test_split_comma_list_ignores_empty_segments():
    assert split_comma_list("a,,b,") == ["a", "b"]


def test_split_comma_list_passes_through_non_str():
    assert split_comma_list(["already", "a", "list"]) == ["already", "a", "list"]


def test_assemble_cors_origins_splits_comma_string():
    result = Settings.assemble_cors_origins("https://a.com, https://b.com")
    assert result == ["https://a.com", "https://b.com"]


def test_assemble_cors_origins_passes_through_list():
    result = Settings.assemble_cors_origins(["https://a.com"])
    assert result == ["https://a.com"]


def test_assemble_cors_origins_rejects_other_types():
    with pytest.raises(ValueError):
        Settings.assemble_cors_origins(123)


def test_validate_team_jwt_secret_key_rejects_empty(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("TEAM_JWT_SECRET_KEY", "placeholder")
    with pytest.raises(ValidationError, match="TEAM_JWT_SECRET_KEY"):
        Settings(TEAM_JWT_SECRET_KEY="")


def test_cors_origins_drop_the_trailing_slash_anyhttpurl_adds():
    """The bug this property exists for: ``AnyHttpUrl("https://a.com")``
    stringifies to ``"https://a.com/"``, browsers send ``Origin: https://a.com``,
    and ``CORSMiddleware`` compares by string equality — so passing the raw
    URLs through meant no origin ever matched and every cross-origin request
    was silently denied its CORS headers."""
    settings = Settings(BACKEND_CORS_ORIGINS="https://a.com,https://b.com")

    assert settings.CORS_ORIGINS == ["https://a.com", "https://b.com"]


def test_cors_origins_keep_a_non_default_port():
    settings = Settings(BACKEND_CORS_ORIGINS="http://localhost:3000")

    assert settings.CORS_ORIGINS == ["http://localhost:3000"]


def test_cors_origins_omit_the_scheme_default_port():
    """A browser leaves :443/:80 out of the Origin header, so rendering it back
    in would produce a string the header can never match."""
    settings = Settings(BACKEND_CORS_ORIGINS="https://a.com:443,http://b.com:80")

    assert settings.CORS_ORIGINS == ["https://a.com", "http://b.com"]


def test_cors_origins_drop_a_path_from_a_configured_entry():
    settings = Settings(BACKEND_CORS_ORIGINS="https://a.com/rally")

    assert settings.CORS_ORIGINS == ["https://a.com"]
