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
