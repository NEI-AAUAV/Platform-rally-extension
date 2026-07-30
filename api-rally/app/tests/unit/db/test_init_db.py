"""Unit tests for the schema-bootstrap/migration helpers in app.db.init_db.

Pure mock-based tests: the real Postgres connection is never touched here —
`_create_schema_and_tables`/`_run_migrations` are exercised against fully
mocked SQLAlchemy/Alembic collaborators so we can cover the fresh-db,
up-to-date, and behind-head branches without a live migration run.
"""

from unittest.mock import MagicMock, patch

from app.db import init_db


def test_create_schema_and_tables_creates_schema_if_not_exists() -> None:
    """Schema creation is unconditional but idempotent: no inspector round-trip,
    just `CREATE SCHEMA IF NOT EXISTS`, which is what makes concurrent uvicorn
    workers safe to race here."""
    connection = MagicMock()

    fake_table = MagicMock(schema="rally")

    with (
        patch.object(init_db.Base.metadata, "tables", {"rally.foo": fake_table}),
        patch.object(init_db.Base.metadata, "reflect") as mock_reflect,
        patch.object(init_db.Base.metadata, "create_all") as mock_create_all,
        patch("app.db.init_db.CreateSchema") as mock_create_schema,
    ):
        init_db._create_schema_and_tables(connection)

    mock_create_schema.assert_called_once_with("rally", if_not_exists=True)
    connection.execute.assert_called_once()
    mock_reflect.assert_called_once()
    mock_create_all.assert_called_once()


def test_create_schema_and_tables_skips_schemaless_tables() -> None:
    """Tables without an explicit schema produce no CREATE SCHEMA at all."""
    connection = MagicMock()

    fake_table = MagicMock(schema=None)

    with (
        patch.object(init_db.Base.metadata, "tables", {"foo": fake_table}),
        patch.object(init_db.Base.metadata, "reflect"),
        patch.object(init_db.Base.metadata, "create_all"),
        patch("app.db.init_db.CreateSchema") as mock_create_schema,
    ):
        init_db._create_schema_and_tables(connection)

    mock_create_schema.assert_not_called()
    connection.execute.assert_not_called()


def test_run_migrations_fresh_database_bootstraps_and_stamps_head() -> None:
    connection = MagicMock()

    fake_context = MagicMock()
    fake_context.get_current_revision.return_value = None

    with (
        patch("app.db.init_db.Config"),
        patch("app.db.init_db.ScriptDirectory") as mock_script_dir,
        patch("app.db.init_db.MigrationContext") as mock_migration_context,
        patch.object(init_db, "_create_schema_and_tables") as mock_bootstrap,
        patch("app.db.init_db.command") as mock_command,
    ):
        mock_script_dir.from_config.return_value.get_current_head.return_value = "head_rev"
        mock_migration_context.configure.return_value = fake_context

        init_db._run_migrations(connection)

    mock_bootstrap.assert_called_once_with(connection)
    fake_context.stamp.assert_called_once_with(mock_script_dir.from_config.return_value, "head_rev")
    mock_command.upgrade.assert_not_called()


def test_run_migrations_fresh_database_with_no_head_skips_stamp() -> None:
    """No revisions exist yet (script dir empty) — nothing to stamp to."""
    connection = MagicMock()

    fake_context = MagicMock()
    fake_context.get_current_revision.return_value = None

    with (
        patch("app.db.init_db.Config"),
        patch("app.db.init_db.ScriptDirectory") as mock_script_dir,
        patch("app.db.init_db.MigrationContext") as mock_migration_context,
        patch.object(init_db, "_create_schema_and_tables") as mock_bootstrap,
        patch("app.db.init_db.command") as mock_command,
    ):
        mock_script_dir.from_config.return_value.get_current_head.return_value = None
        mock_migration_context.configure.return_value = fake_context

        init_db._run_migrations(connection)

    mock_bootstrap.assert_called_once_with(connection)
    fake_context.stamp.assert_not_called()
    mock_command.upgrade.assert_not_called()


def test_run_migrations_already_at_head_is_noop() -> None:
    connection = MagicMock()

    fake_context = MagicMock()
    fake_context.get_current_revision.return_value = "head_rev"

    with (
        patch("app.db.init_db.Config"),
        patch("app.db.init_db.ScriptDirectory") as mock_script_dir,
        patch("app.db.init_db.MigrationContext") as mock_migration_context,
        patch.object(init_db, "_create_schema_and_tables") as mock_bootstrap,
        patch("app.db.init_db.command") as mock_command,
    ):
        mock_script_dir.from_config.return_value.get_current_head.return_value = "head_rev"
        mock_migration_context.configure.return_value = fake_context

        init_db._run_migrations(connection)

    mock_bootstrap.assert_not_called()
    mock_command.upgrade.assert_not_called()


def test_run_migrations_behind_head_upgrades() -> None:
    connection = MagicMock()

    fake_context = MagicMock()
    fake_context.get_current_revision.return_value = "old_rev"

    with (
        patch("app.db.init_db.Config"),
        patch("app.db.init_db.ScriptDirectory") as mock_script_dir,
        patch("app.db.init_db.MigrationContext") as mock_migration_context,
        patch.object(init_db, "_create_schema_and_tables") as mock_bootstrap,
        patch("app.db.init_db.command") as mock_command,
    ):
        mock_script_dir.from_config.return_value.get_current_head.return_value = "head_rev"
        mock_migration_context.configure.return_value = fake_context

        init_db._run_migrations(connection)

    mock_bootstrap.assert_not_called()
    mock_command.upgrade.assert_called_once()
