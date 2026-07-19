"""Unit tests for the pure regex-builder helpers in app.crud._deps."""
from app.crud._deps import foreign_key_error_regex, unique_key_error_regex


def test_unique_key_error_regex_matches_postgres_message():
    pattern = unique_key_error_regex("email")
    message = "duplicate key value violates unique constraint. Key (email)=(a@b.com) already exists."
    assert pattern.search(message) is not None


def test_unique_key_error_regex_does_not_match_other_column():
    pattern = unique_key_error_regex("email")
    message = "Key (name)=(Ana) already exists."
    assert pattern.search(message) is None


def test_foreign_key_error_regex_matches_postgres_message():
    pattern = foreign_key_error_regex("team_id")
    message = "Key (team_id)=(42) is not present in table \"teams\"."
    assert pattern.search(message) is not None


def test_foreign_key_error_regex_does_not_match_unrelated_message():
    pattern = foreign_key_error_regex("team_id")
    message = "Key (team_id)=(42) already exists."
    assert pattern.search(message) is None
