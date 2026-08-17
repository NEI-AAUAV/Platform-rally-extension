"""Business rules for the rally-guide view: guide-mode gating and
checkpoint-with-media/indications listing.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import RallyForbiddenError
from app.crud.crud_activity import rally_event
from app.crud.crud_checkpoint import checkpoint as checkpoint_crud
from app.crud.crud_rally_settings import rally_settings
from app.models.activity import EventType
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.team import Team
from app.services.route_progress import resolved_checkpoint_orders


class GuideService:
    """Guide-mode gating and checkpoint gallery listing for the guide view."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_checkpoints_with_gallery(
        self, *, user_id: int | None = None, is_privileged: bool = False
    ) -> tuple[list[CheckPoint], int | None]:
        """Checkpoints for the current event, with media/indications
        eager-loaded, ordered by checkpoint order, plus the id of the
        checkpoint the guide's team currently needs (``None`` for a
        privileged caller or a guide with no team assigned).

        A guide accompanies their team through the whole route rather than
        being fixed to one post, so they see every checkpoint — the caller
        highlights the current one instead of the list being cut down to it.
        Write access (marking an arrival) stays scoped to the current post
        via ``can_manage_checkpoint``; this is the read path only.

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
            # Drafts are posts still being planned: nobody is sent there, so
            # they would only be noise here.
            .where(event_filter, CheckPoint.is_draft.is_(False))
            .options(
                selectinload(CheckPoint.media),
                selectinload(CheckPoint.guide_indications),
            )
            .order_by(CheckPoint.order)
        )

        current_id = (
            None if is_privileged or user_id is None else await self.current_checkpoint_id(user_id)
        )

        checkpoints = list((await self._db.scalars(stmt)).all())
        return checkpoints, current_id

    async def assigned_team_id(self, user_id: int) -> int | None:
        """The team this guide accompanies, if any.

        RallyGuideAssignment is unique per user and its team_id is nullable,
        so "assigned to nothing" and "no row at all" both mean None.
        """
        stmt = select(RallyGuideAssignment.team_id).where(RallyGuideAssignment.user_id == user_id)
        return (await self._db.scalars(stmt)).first()

    async def current_checkpoint_id(self, user_id: int) -> int | None:
        """The checkpoint this guide's assigned team is currently working
        on, if any.

        A guide follows one team through the whole route rather than being
        fixed to a post, so "their" checkpoint moves as the team progresses:
        the earliest-order checkpoint the team has not yet resolved (see
        ``resolved_checkpoint_orders``). ``None`` when the guide has no team
        assigned, or their team has resolved every checkpoint.
        """
        checkpoints, resolved_orders = await self._team_progress(user_id)
        if checkpoints is None:
            return None
        for cp in checkpoints:
            if cp.order not in resolved_orders:
                return cp.id
        return None

    async def _team_progress(self, user_id: int) -> tuple[list[CheckPoint] | None, frozenset[int]]:
        """This guide's team's ordered checkpoints and resolved orders, or
        ``(None, frozenset())`` when the guide has no team assigned."""
        team_id = await self.assigned_team_id(user_id)
        if team_id is None:
            return None, frozenset()
        team = await self._db.get(Team, team_id)
        if team is None:
            return None, frozenset()

        checkpoints = list(await checkpoint_crud.get_all_ordered(self._db))
        if not checkpoints:
            return None, frozenset()
        return checkpoints, await resolved_checkpoint_orders(self._db, team)

    async def accessible_checkpoint_ids(self, user_id: int) -> set[int]:
        """Checkpoints this guide may act on right now: their team's current
        post, plus the one it just resolved.

        Marking an arrival resolves the checkpoint immediately, which would
        otherwise strip write access before the guide finishes there (e.g.
        checking who else arrived, or a duplicate arrival call landing after
        the state already advanced). Including the just-resolved checkpoint
        keeps that window open without granting the whole route.
        """
        checkpoints, resolved_orders = await self._team_progress(user_id)
        if checkpoints is None:
            return set()

        ids: set[int] = set()
        current_order: int | None = None
        for cp in checkpoints:
            if cp.order not in resolved_orders:
                ids.add(cp.id)
                current_order = cp.order
                break

        if resolved_orders:
            last_resolved_order = max(resolved_orders)
            # Only the most recently resolved post — resolving order 2 also
            # implies order 1 is resolved, but that shouldn't reopen access
            # to a post the team left an arbitrary number of steps ago.
            if current_order is None or last_resolved_order == current_order - 1:
                for cp in checkpoints:
                    if cp.order == last_resolved_order:
                        ids.add(cp.id)
                        break

        return ids

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
        return checkpoint_id in await self.accessible_checkpoint_ids(user_id)
