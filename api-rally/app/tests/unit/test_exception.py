"""Unit tests for the RallyError domain exception hierarchy."""

from app.core.exceptions import (
    RallyConflictError,
    RallyError,
    RallyForbiddenError,
    RallyNotFoundError,
    RallyUnauthorizedError,
    RallyValidationError,
)


def test_rally_error_defaults_status_code_500_and_carries_message():
    exc = RallyError("boom")
    assert exc.status_code == 500
    assert exc.message == "boom"


def test_rally_validation_error_status_code_400():
    assert RallyValidationError("bad").status_code == 400


def test_rally_forbidden_error_status_code_403():
    assert RallyForbiddenError("nope").status_code == 403


def test_rally_not_found_error_status_code_404():
    assert RallyNotFoundError("missing").status_code == 404


def test_rally_unauthorized_error_status_code_401():
    assert RallyUnauthorizedError("who are you").status_code == 401


def test_rally_conflict_error_status_code_409():
    assert RallyConflictError("conflict").status_code == 409
