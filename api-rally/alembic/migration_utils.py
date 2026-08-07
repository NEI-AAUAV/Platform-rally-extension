"""Shared helpers for unique-constraint migrations that must be idempotent
against fresh databases baselined via create_all (which already has the
constraint).
"""

import sqlalchemy as sa
from alembic import op


def constraint_exists(table: str, schema: str, constraint: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table, schema=schema):
        return True  # nothing to do either way
    constraints = inspector.get_unique_constraints(table, schema=schema)
    return any(c["name"] == constraint for c in constraints)


def table_exists(table: str, schema: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(table, schema=schema)


def existing_columns(table: str, schema: str) -> set[str]:
    bind = op.get_bind()
    return {c["name"] for c in sa.inspect(bind).get_columns(table, schema=schema)}


def column_exists(table: str, column: str, schema: str) -> bool:
    return column in existing_columns(table, schema)


def add_missing_columns(table: str, columns: dict[str, sa.Column], schema: str) -> None:
    """Add each column in ``columns`` that isn't already present. Idempotent
    against fresh databases baselined via create_all (which already has them)."""
    existing = existing_columns(table, schema)
    for name, column in columns.items():
        if name not in existing:
            op.add_column(table, column, schema=schema)


def drop_present_columns(table: str, columns: dict[str, sa.Column], schema: str) -> None:
    existing = existing_columns(table, schema)
    for name in columns:
        if name in existing:
            op.drop_column(table, name, schema=schema)


def create_penalty_ledger_table(
    table: str,
    schema: str,
    *,
    extra_columns: list[sa.Column] | None = None,
    unique: tuple[str, ...],
    unique_name: str,
    timestamp_column: str,
) -> None:
    """Create a per-team, per-checkpoint penalty ledger table (hint reveals,
    skips, ...): id, team_id/checkpoint_id FKs, a timestamp, a cost, plus any
    ``extra_columns`` (e.g. an indication FK), unique on ``unique``."""
    op.create_table(
        table,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "team_id",
            sa.Integer(),
            sa.ForeignKey(f"{schema}.teams.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "checkpoint_id",
            sa.Integer(),
            sa.ForeignKey(f"{schema}.checkpoints.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        *(extra_columns or []),
        sa.Column(
            timestamp_column,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("cost", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint(*unique, name=unique_name),
        schema=schema,
    )


def backfill_peddy_paper_penalty(schema: str, settings_table: str, column: str, value: int) -> None:
    op.execute(
        sa.text(
            f"""
            UPDATE {schema}.{settings_table} AS s
               SET {column} = {value}
              FROM {schema}.rally_events AS e
             WHERE s.event_id = e.id
               AND e.event_type = 'peddy_paper'
            """
        )
    )


def create_team_score_history_table(schema: str) -> None:
    op.create_table(
        "team_score_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "event_id",
            sa.Integer(),
            sa.ForeignKey(f"{schema}.rally_events.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "team_id",
            sa.Integer(),
            sa.ForeignKey(f"{schema}.teams.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        schema=schema,
    )
    op.create_index(
        "ix_score_history_event_time",
        "team_score_history",
        ["event_id", "recorded_at"],
        schema=schema,
    )


def drop_team_score_history_table(schema: str) -> None:
    op.drop_index(
        "ix_score_history_event_time",
        table_name="team_score_history",
        schema=schema,
    )
    op.drop_table("team_score_history", schema=schema)
