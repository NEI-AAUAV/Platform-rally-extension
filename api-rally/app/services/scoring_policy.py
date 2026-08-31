"""The event-level gate on who may write scores.

``enable_staff_scoring`` is the manager's master switch for staff-entered
results. It lived as a private helper inside the staff-evaluation router, so
the twin write paths on ``/activities`` — updating a result, applying extra
shots, applying a penalty — were never subject to it: flipping the switch off
closed one door and left the other open on the same rows.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyForbiddenError
from app.crud.crud_rally_settings import rally_settings

STAFF_SCORING_DISABLED = (
    "Staff scoring is disabled for this event. Only an admin or manager can "
    "record or edit evaluations."
)


async def require_staff_scoring_enabled(db: AsyncSession, *, is_admin_or_manager: bool) -> None:
    """Block staff (non admin/manager) when ``enable_staff_scoring`` is off.

    Admins and managers keep write access so they can still correct results
    while the master switch is disabled in the admin UI.
    """
    if is_admin_or_manager:
        return
    rally_config = await rally_settings.get_or_create(db)
    if not rally_config.enable_staff_scoring:
        raise RallyForbiddenError(STAFF_SCORING_DISABLED)
