"""Transaction-scoped advisory locks for writes that span a whole row set.

Ordering row locks by primary key is not enough to make a whole-set
``SELECT ... FOR UPDATE`` deadlock-free. When another transaction has already
updated one of the rows, the locking scan blocks mid-way, and on waking it
re-fetches the updated tuple version (EvalPlanQual) and carries on from the
heap position of that version — so the remaining rows are no longer taken in
key order. Three concurrent check-ins running the *same* id-ordered
``FOR UPDATE`` over ``teams`` deadlocked against each other in CI exactly this
way.

The fix is a single serialization point taken *before* any row lock: every
transaction that intends to lock the whole team set for an edition first takes
one advisory lock keyed by that edition. Only one such transaction runs at a
time, so there is no lock cycle to detect, whatever order the row locks
themselves end up in. The row locks stay — they still guard against writers
that do not go through this path.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Fixed namespace for pg_advisory_xact_lock's two-int form, so these locks
# cannot collide with an advisory lock taken for anything else (see
# ScoringService's per-activity lock, which uses its own namespace).
TEAM_RANKING_LOCK_NAMESPACE = 41_206


def _dialect_name(db: AsyncSession) -> str:
    """Backend name of the bound engine ("postgresql", "sqlite", ...)."""
    try:
        return str(db.get_bind().dialect.name)
    except Exception:
        return ""


async def lock_team_ranking(db: AsyncSession, event_id: int | None) -> None:
    """Serialize whole-team-set writes for one edition, for this transaction.

    Re-entrant within a transaction (Postgres counts advisory locks per
    session), so nested callers — ``add_checkpoint`` locking the set and then
    the recompute inside it locking again — are free. A no-op on non-Postgres
    backends, where the unit suite runs without concurrency.
    """
    if _dialect_name(db) != "postgresql":
        return
    # event_id is None only for legacy unscoped rows; they all share key 0,
    # which is the same set they'd contend over anyway.
    await db.execute(select(func.pg_advisory_xact_lock(TEAM_RANKING_LOCK_NAMESPACE, event_id or 0)))
