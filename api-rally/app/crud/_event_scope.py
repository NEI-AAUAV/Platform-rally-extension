"""Helpers for scoping queries to the current event.

Teams, checkpoints and activities belong to an event (``event_id``). The
"current" event is resolved (and lazily bootstrapped) via crud.rally_event, so
list/count/create operations can transparently restrict themselves to the
active edition without every caller having to know about events.
"""

from sqlalchemy.ext.asyncio import AsyncSession


async def current_event_id(db: AsyncSession) -> int:
    """Return the id of the current event, creating a default if none exists."""
    # Local import: avoids circular import with app.crud.crud_activity
    # (crud_activity imports current_event_id at module level; rally_event
    # lives in crud_activity, so this side of the cycle must stay lazy).
    from app.crud.crud_activity import rally_event

    event = await rally_event.ensure_current(db)
    return event.id
