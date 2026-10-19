"""Per-session memo for rows nearly every request re-reads.

The current event and its settings row are resolved several times per request
(auth deps, scoping helpers, the handler itself). Each lookup is a round trip,
so the answer is remembered on the session and dropped as soon as that session
writes, commits or rolls back. It lives and dies with the session, so another
request, another worker process or an admin's change can never be served a
stale row — the worst case is the snapshot one request already works with.
"""

from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

CURRENT_EVENT = "rally.memo.current_event"
EVENT_SETTINGS = "rally.memo.event_settings"
_KEYS = (CURRENT_EVENT, EVENT_SETTINGS)


def recall(db: Any, key: str) -> Any | None:
    """The row remembered under ``key``, or None when absent or unusable."""
    if not isinstance(db, AsyncSession):
        return None
    obj = db.info.get(key)
    if obj is None:
        return None
    state = inspect(obj)
    # Anything detached, moved to another session or expired would need IO to
    # read, which the caller is not expecting: treat it as a miss.
    if state.session is not db.sync_session or state.expired_attributes:
        db.info.pop(key, None)
        return None
    return obj


def remember(db: Any, key: str, obj: Any) -> None:
    if isinstance(db, AsyncSession):
        db.info[key] = obj


def _forget_all(session: Session, *_args: Any) -> None:
    for key in _KEYS:
        session.info.pop(key, None)


# Any write may change what the memo holds, and a rollback may undo what it
# was built from: drop it rather than reason about which.
event.listen(Session, "after_flush", _forget_all)
event.listen(Session, "after_commit", _forget_all)
event.listen(Session, "after_soft_rollback", _forget_all)
