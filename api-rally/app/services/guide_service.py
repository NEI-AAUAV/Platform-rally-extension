"""Business rules for the rally-guide view: guide-mode gating and
checkpoint-with-media/indications listing.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import RallyForbiddenError
from app.crud.crud_activity import rally_event
from app.crud.crud_rally_settings import rally_settings
from app.models.activity import EventType
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.team import Team


class GuideService:
    """Guide-mode gating and checkpoint gallery listing for the guide view."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_checkpoints_with_gallery(
        self, *, user_id: int | None = None, is_privileged: bool = False
    ) -> list[CheckPoint]:
        """Checkpoints for the current event, with media/indications
        eager-loaded, ordered by checkpoint order.

        Scoped to the guide's own assignment. In a peddy paper the route *is*
        the answer key, and a guide's phone showing every post is one glance
        over the shoulder away from handing a team the rest of the game. Staff
        and admins keep the full list — they run the event.

        A guide with no assignment still sees everything: an admin who forgot
        to assign them would otherwise leave them with a blank screen mid-event,
        which is worse than the leak it prevents.

        Raises RallyForbiddenError when guide mode is not active and the
        current event is not Peddy Paper (which always allows the guide view).
        """
        event = await rally_event.get_current(self._db)

        settings = await rally_settings.get_or_create(self._db)
        guide_mode_on = settings.guide_mode_enabled and settings.guide_mode_active
        is_peddy_paper = event is not None and event.event_type == EventType.PEDDY_PAPER.value
        if not guide_mode_on and not is_peddy_paper:
            raise RallyForbiddenError("Guide mode is not active for this event")

        event_filter = CheckPoint.event_id == event.id if event else CheckPoint.event_id.is_(None)
        stmt = (
            select(CheckPoint)
            # Drafts are posts still being planned: nobody is stationed at one
            # and no team is sent there, so they would only be noise here.
            .where(event_filter, CheckPoint.is_draft.is_(False))
            .options(
                selectinload(CheckPoint.media),
                selectinload(CheckPoint.guide_indications),
            )
            .order_by(CheckPoint.order)
        )

        assigned_id = (
            None if is_privileged or user_id is None else await self.assigned_checkpoint_id(user_id)
        )
        if assigned_id is not None:
            stmt = stmt.where(CheckPoint.id == assigned_id)

        return list((await self._db.scalars(stmt)).all())

    async def assigned_checkpoint_id(self, user_id: int) -> int | None:
        """The checkpoint this guide is accompanying, if any.

        RallyGuideAssignment is unique per user and its checkpoint_id is
        nullable, so "assigned to nothing" and "no row at all" both mean None.
        """
        stmt = select(RallyGuideAssignment.checkpoint_id).where(
            RallyGuideAssignment.user_id == user_id
        )
        return (await self._db.scalars(stmt)).first()

    async def teams_at_checkpoint(self, checkpoint_id: int) -> list[dict[str, Any]]:
        """Teams that have arrived at this post, with the hints they bought.

        The hint state is the point: a team can unlock the guide indications in
        the app, paying points for each. Without this the guide reads out a
        hint the team already paid for — the same words, for free, seconds
        later. Sorted by arrival so the guide sees who turned up first.
        """
        stmt = (
            select(CheckpointArrival, Team)
            .join(Team, Team.id == CheckpointArrival.team_id)
            .where(CheckpointArrival.checkpoint_id == checkpoint_id)
            .order_by(CheckpointArrival.arrived_at)
        )
        rows = (await self._db.execute(stmt)).all()
        if not rows:
            return []

        reveals_stmt = select(CheckpointHintReveal).where(
            CheckpointHintReveal.checkpoint_id == checkpoint_id,
            CheckpointHintReveal.team_id.in_([team.id for _, team in rows]),
        )
        revealed_by_team: dict[int, set[int]] = {}
        for reveal in (await self._db.scalars(reveals_stmt)).all():
            revealed_by_team.setdefault(reveal.team_id, set()).add(reveal.indication_id)

        return [
            {
                "team_id": team.id,
                "team_name": team.name,
                "arrived_at": arrival.arrived_at,
                # None coordinates mean a guide vouched for this arrival
                # rather than a GPS fix.
                "arrived_by_guide": arrival.latitude is None and arrival.longitude is None,
                "revealed_indication_ids": sorted(revealed_by_team.get(team.id, set())),
            }
            for arrival, team in rows
        ]

    async def can_manage_checkpoint(
        self, *, user_id: int, checkpoint_id: int, is_privileged: bool
    ) -> bool:
        """Whether this guide may act on a checkpoint (e.g. mark an arrival).

        Stricter than the read path: an unassigned guide may *see* the route so
        a misconfigured event is not unusable, but writing progress for a post
        nobody put them at is not something to be lenient about.
        """
        if is_privileged:
            return True
        return await self.assigned_checkpoint_id(user_id) == checkpoint_id
