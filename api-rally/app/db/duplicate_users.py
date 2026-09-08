"""The SQL that collapses duplicate ``user`` rows onto one row per email.

Lives here rather than inline in the migration so it can be exercised against a
real schema by the test suite: an alembic revision is only runnable inside an
alembic context, and this merge is too destructive to ship unverified.

Why the duplicates exist: staff are mirrored from the Authentik management API
and matched by email with ``authentik_sub`` left NULL; the login path is meant
to adopt that placeholder, and when it does not, the person ends up with a
second row. Because ``rally_staff_assignment.user_id`` is not a foreign key,
their checkpoint stays on the placeholder and the row they log in as looks
unassigned.
"""

# Ledgers keyed on (user_id, <other>). A loser's row moves to the survivor only
# when the survivor does not already hold that pair; the rest are deleted.
# Rewriting blindly would violate each table's unique constraint.
ASSIGNMENT_TABLES: tuple[tuple[str, str], ...] = (
    ("rally_staff_assignment", "checkpoint_id"),
    ("rally_guide_assignment", "team_id"),
)

INDEX_NAME = "ix_user_email_unique"


def normalize_emails_sql(schema: str) -> str:
    """One rendering per address, so grouping and the unique index agree."""
    return f'UPDATE "{schema}"."user" SET email = lower(trim(email)) WHERE email IS NOT NULL'


def build_dup_map_sql(schema: str) -> str:
    """Map each duplicate row to its survivor.

    Survivor preference: a row that already carries an ``authentik_sub``
    (someone has actually logged in as it), then the lowest id.
    """
    return f"""
        CREATE TEMP TABLE dup_map ON COMMIT DROP AS
        WITH ranked AS (
            SELECT
                id,
                first_value(id) OVER (
                    PARTITION BY email
                    ORDER BY (authentik_sub IS NULL), id
                ) AS keep_id
            FROM "{schema}"."user"
            WHERE email IS NOT NULL
        )
        SELECT id AS loser_id, keep_id FROM ranked WHERE id <> keep_id
    """


def merge_fields_sql(schema: str) -> str:
    """Fill the survivor's empty identity/membership fields from its losers."""
    return f"""
        UPDATE "{schema}"."user" k SET
            authentik_sub = COALESCE(k.authentik_sub, m.authentik_sub),
            team_id = COALESCE(k.team_id, m.team_id),
            staff_checkpoint_id = COALESCE(k.staff_checkpoint_id, m.staff_checkpoint_id),
            is_captain = k.is_captain OR m.is_captain,
            -- Union of every scope held across the group: a person mirrored as
            -- rally-staff who logged in as rally-guide must keep both.
            scopes = (
                SELECT COALESCE(array_agg(DISTINCT q.scope), ARRAY[]::varchar[])
                FROM (
                    SELECT unnest(COALESCE(k.scopes, ARRAY[]::varchar[])) AS scope
                    UNION
                    SELECT unnest(COALESCE(l3.scopes, ARRAY[]::varchar[]))
                    FROM dup_map d3
                    JOIN "{schema}"."user" l3 ON l3.id = d3.loser_id
                    WHERE d3.keep_id = k.id
                ) q
            )
        FROM (
            SELECT
                d.keep_id,
                (array_agg(l.authentik_sub) FILTER (WHERE l.authentik_sub IS NOT NULL))[1]
                    AS authentik_sub,
                (array_agg(l.team_id) FILTER (WHERE l.team_id IS NOT NULL))[1] AS team_id,
                (array_agg(l.staff_checkpoint_id)
                    FILTER (WHERE l.staff_checkpoint_id IS NOT NULL))[1] AS staff_checkpoint_id,
                bool_or(l.is_captain) AS is_captain
            FROM dup_map d
            JOIN "{schema}"."user" l ON l.id = d.loser_id
            GROUP BY d.keep_id
        ) m
        WHERE k.id = m.keep_id
    """


def release_loser_subs_sql(schema: str) -> str:
    """Move ``authentik_sub`` off the losers.

    Must run before the survivor keeps it under the unique index on that
    column, which would otherwise briefly see two rows holding one value.
    """
    return (
        f'UPDATE "{schema}"."user" SET authentik_sub = NULL '
        "WHERE id IN (SELECT loser_id FROM dup_map)"
    )


def repoint_assignment_sql(schema: str, table: str, other_column: str) -> str:
    return f"""
        UPDATE "{schema}".{table} a SET user_id = d.keep_id
        FROM dup_map d
        WHERE a.user_id = d.loser_id
          AND NOT EXISTS (
              SELECT 1 FROM "{schema}".{table} b
              WHERE b.user_id = d.keep_id AND b.{other_column} = a.{other_column}
          )
    """


def drop_leftover_assignment_sql(schema: str, table: str) -> str:
    """Whatever still points at a loser duplicates a row the survivor holds."""
    return f'DELETE FROM "{schema}".{table} a USING dup_map d WHERE a.user_id = d.loser_id'


def repoint_push_subscriptions_sql(schema: str) -> str:
    """``endpoint`` is unique globally, so a plain repoint cannot collide."""
    return (
        f'UPDATE "{schema}".push_subscriptions a SET user_id = d.keep_id '
        "FROM dup_map d WHERE a.user_id = d.loser_id"
    )


def delete_losers_sql(schema: str) -> str:
    return f'DELETE FROM "{schema}"."user" WHERE id IN (SELECT loser_id FROM dup_map)'


def create_unique_email_index_sql(schema: str) -> str:
    """The index ``0049`` intended, on the table that actually exists.

    ``Base.__tablename__`` derives ``User`` -> ``user``; 0049 targeted
    ``users`` behind a ``table_exists`` guard and so never ran.
    """
    return (
        f'CREATE UNIQUE INDEX IF NOT EXISTS {INDEX_NAME} ON "{schema}"."user" (email) '
        "WHERE email IS NOT NULL"
    )


def drop_unique_email_index_sql(schema: str) -> str:
    return f'DROP INDEX IF EXISTS "{schema}".{INDEX_NAME}'
