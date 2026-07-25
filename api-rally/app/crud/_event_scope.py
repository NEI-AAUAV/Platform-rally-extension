"""Helpers for scoping queries to the current event.

Teams, checkpoints and activities belong to an event (``event_id``). The
"current" event is resolved (and lazily bootstrapped) via crud.rally_event, so
list/count/create operations can transparently restrict themselves to the
active edition without every caller having to know about events.
"""

from sqlalchemy.ext.asyncio import AsyncSession


async def current_event_id(db: AsyncSession) -> int:
    """Return the id of the current event, creating a default if none exists."""
    from app.crud.crud_activity import rally_event

    event = await rally_event.ensure_current(db)
    return event.id
