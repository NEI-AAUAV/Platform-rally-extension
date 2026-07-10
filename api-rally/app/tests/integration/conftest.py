"""Integration test config.

`pg_session` (real-schema Postgres fixture) now lives in the root
`app/tests/conftest.py` so both `integration/` and the rest of the suite can
use it during the gradual mock -> Postgres migration. Pytest fixture
inheritance makes it available here automatically; nothing to re-declare.
"""
