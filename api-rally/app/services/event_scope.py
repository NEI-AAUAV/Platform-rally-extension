"""Edition scoping: the one guard that keeps a team's writes inside its own event.

Lived in ``checkin_service`` while the QR check-in was its only caller. It now
guards every path that writes progress or points — arrivals, skips, hints,
proximity, deferred capture and staff evaluation — and ``checkin_service``
imports ``staff_evaluation_utils``, so leaving it there made the guard
unreachable from the evaluation side without an import cycle. It has no
dependencies of its own beyond the error type, so a module of its own costs
nothing and can be imported from anywhere.
"""

from app.core.exceptions import RallyNotFoundError

CHECKPOINT_NOT_FOUND = "Checkpoint not found"


def require_same_event(team_event_id: int, resource_event_id: int) -> None:
    """Reject cross-event writes.

    A valid token/scan for a checkpoint — or an activity — of another edition
    must not advance or score a team in this one. Since migration 0055 every
    scoped row carries an event, so the comparison is strict: there is no
    unscoped row left to wave through.

    Raises ``RallyNotFoundError``, not a permission error: a resource of another
    edition should read as absent rather than have its existence confirmed.
    """
    if team_event_id != resource_event_id:
        raise RallyNotFoundError(CHECKPOINT_NOT_FOUND)
