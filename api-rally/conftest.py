"""Rootdir conftest.

Only holds command-line option registration. `pytest_addoption` must live in
the *rootdir* conftest so the option is recognised no matter which path under
`app/tests/` is passed to pytest (a `pytest_addoption` in a nested conftest is
only picked up when that conftest happens to be an initial/collected one).
"""

from pytest import Parser


def pytest_addoption(parser: Parser) -> None:
    """--require-pg turns the "Postgres unavailable" skip into a hard failure.

    Locally the real-schema fixtures skip when Postgres is unreachable so the
    mock suite still runs. In CI (and any run that must exercise the DB path)
    pass --require-pg so a missing/broken Postgres fails loudly instead of
    silently skipping half the suite.
    """
    parser.addoption(
        "--require-pg",
        action="store_true",
        default=False,
        help="Fail instead of skip when the test Postgres is unavailable.",
    )
