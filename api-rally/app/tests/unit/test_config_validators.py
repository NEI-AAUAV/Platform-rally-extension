"""Unit tests for the pure validator/helper functions in app.core.config."""
import pytest
from pydantic import ValidationError

from app.core.config import Settings, _split_comma_list


def test_split_comma_list_splits_and_strips():
    assert _split_comma_list("a, b ,c") == ["a", "b", "c"]


def test_split_comma_list_ignores_empty_segments():
    assert _split_comma_list("a,,b,") == ["a", "b"]


def test_split_comma_list_passes_through_non_str():
    assert _split_comma_list(["already", "a", "list"]) == ["already", "a", "list"]


def test_assemble_cors_origins_splits_comma_string():
    result = Settings.assemble_cors_origins("http://a.com, http://b.com")
    assert result == ["http://a.com", "http://b.com"]


def test_assemble_cors_origins_passes_through_list():
    result = Settings.assemble_cors_origins(["http://a.com"])
    assert result == ["http://a.com"]


def test_assemble_cors_origins_rejects_other_types():
    with pytest.raises(ValueError):
        Settings.assemble_cors_origins(123)


def test_validate_team_jwt_secret_key_rejects_empty(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("TEAM_JWT_SECRET_KEY", "placeholder")
    with pytest.raises(ValidationError, match="TEAM_JWT_SECRET_KEY"):
        Settings(TEAM_JWT_SECRET_KEY="")
