"""Business rules for checkpoints: visibility, teams-at-checkpoint listing,
and cascading delete. Moved out of app.api.api_v1.checkpoint, which used to
hold this logic inline in the router handlers.
"""

import math
from collections.abc import Sequence
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import RallyValidationError
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_team import CRUDTeam
from app.models.activity import Activity
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.models.team import Team
from app.models.user import User
from app.schemas.checkpoint import (
    AdminCheckPoint,
    DetailedCheckPoint,
    RouteStatus,
)
from app.schemas.team import ListingTeam
from app.services.checkpoint_planning import missing_fields
from app.services.route_progress import load_stages, resolved_checkpoint_orders
from app.services.route_stages import is_reachable_in_stages
from app.services.team_service import TeamService


class CheckpointService:
    """Checkpoint visibility rules, team roster lookups, and lifecycle."""

    def __init__(
        self, db: AsyncSession, checkpoint_crud: CRUDCheckPoint, team_crud: CRUDTeam
    ) -> None:
        self._db = db
        self._checkpoint_crud = checkpoint_crud
        self._team_crud = team_crud

    @staticmethod
    def _validate_list(items: Sequence[Any]) -> list[DetailedCheckPoint]:
        adapter = TypeAdapter(list[DetailedCheckPoint])
        return adapter.validate_python(items)

    async def _arrived_checkpoint_ids(self, team_id: int) -> set[int]:
        """Checkpoints this team has physically checked into.

        Completion and arrival are different things: a post with an activity
        only *completes* once staff scores it, but the team is standing at it
        the moment it checks in. Reveal follows arrival — see
        ``_redact_unreached``.
        """
        stmt = select(CheckpointArrival.checkpoint_id).where(CheckpointArrival.team_id == team_id)
        return set((await self._db.scalars(stmt)).all())

    @staticmethod
    def _search_area(checkpoint: DetailedCheckPoint, radius_m: int) -> tuple[float, float] | None:
        """A circle the real post sits inside, but is not the centre of.

        Narrowing the city to a neighbourhood is the point; centring the circle
        on the post would just be the pin with extra steps. The offset is
        derived from the checkpoint id so it is stable across requests — a
        circle that jitters between refreshes could be averaged back to the
        centre.
        """
        if checkpoint.latitude is None or checkpoint.longitude is None or radius_m <= 0:
            return None
        # Deterministic angle from the id; magnitude fixed at half the radius,
        # which keeps the post comfortably inside the circle wherever it lands.
        angle = (checkpoint.id * 137.508) % 360  # golden angle: spreads ids out
        offset_m = radius_m / 2
        north_m = offset_m * math.cos(math.radians(angle))
        east_m = offset_m * math.sin(math.radians(angle))
        lat = checkpoint.latitude + north_m / 111_320
        lon = checkpoint.longitude + east_m / (
            111_320 * max(math.cos(math.radians(checkpoint.latitude)), 0.01)
        )
        return lat, lon

    @staticmethod
    def _redact_unreached(
        checkpoint: DetailedCheckPoint,
        *,
        current_order: int,
        has_arrived: bool = False,
        search_radius_m: int = 0,
        current_orders: frozenset[int] | None = None,
        resolved_orders: frozenset[int] | None = None,
    ) -> DetailedCheckPoint:
        """Strip the answer-bearing fields from a checkpoint the team hasn't
        reached yet: name, description, and coordinates. In a peddy paper,
        the checkpoint's location *is* the puzzle answer, so this must not
        leak through any team-facing list.

        Two things earn the reveal, and either is enough:

        * the post is **completed** (order < current_order) — which also covers
          a staff evaluation recorded without any GPS check-in, since that
          advances the team past the post;
        * the team has **arrived** (a CheckpointArrival row). A post with an
          activity stays "current" until staff scores it, and withholding its
          name and photos from a team standing in front of it made arriving
          unrewarding — finding the place is the whole game.

        The ``clue`` survives redaction, but **only for the post the team is
        currently hunting** (order == current_order). A riddle describes its
        place well enough that anyone who knows the city can read it and skip
        straight there, so handing over the whole route's riddles at once lets
        a team solve post 4 while standing at post 1. One riddle at a time is
        the game. It is also mirrored into ``description`` so clients that only
        render the description still show something.
        """
        # With stages, "done" and "current" stop being a single number: a
        # free-choice stage leaves several posts open at once, and the team may
        # have resolved them out of order. The caller passes the two sets when
        # that is the case; otherwise the sequential comparison stands.
        is_resolved = (
            checkpoint.order in resolved_orders
            if resolved_orders is not None
            else checkpoint.order < current_order
        )
        if is_resolved or has_arrived:
            return checkpoint
        area = CheckpointService._search_area(checkpoint, search_radius_m)
        # Only the posts they may head to now. Public callers pass
        # current_order=0 and no set, so they never match and get no riddle.
        is_current = (
            checkpoint.order in current_orders
            if current_orders is not None
            else checkpoint.order == current_order
        )
        clue = checkpoint.clue if is_current else None
        return checkpoint.model_copy(
            update={
                "name": f"Posto {checkpoint.order}",
                "description": clue,
                "clue": clue,
                "clue_media_url": checkpoint.clue_media_url if is_current else None,
                "latitude": None,
                "longitude": None,
                "is_redacted": True,
                "search_latitude": area[0] if area else None,
                "search_longitude": area[1] if area else None,
                "search_radius_m": search_radius_m if area else None,
            }
        )

    def _redact_list(
        self,
        checkpoints: Sequence[Any],
        *,
        current_order: int,
        reveal_next: bool,
        arrived_ids: frozenset[int] = frozenset(),
        search_radius_m: int = 0,
        current_orders: frozenset[int] | None = None,
        resolved_orders: frozenset[int] | None = None,
    ) -> list[DetailedCheckPoint]:
        validated = self._validate_list(checkpoints)
        if reveal_next:
            return validated
        return [
            self._redact_unreached(
                cp,
                current_order=current_order,
                has_arrived=cp.id in arrived_ids,
                search_radius_m=search_radius_m,
                current_orders=current_orders,
                resolved_orders=resolved_orders,
            )
            for cp in validated
        ]

    async def all_checkpoints(self) -> list[DetailedCheckPoint]:
        """Every checkpoint in the current event, ordered — the admin/staff view."""
        return self._validate_list(await self._checkpoint_crud.get_all_ordered(db=self._db))

    async def next_checkpoint_for_team(
        self, team_id: int, settings: Any
    ) -> DetailedCheckPoint | None:
        """The single next checkpoint a team must head to, redacted like
        everything else in the list view (`GET /checkpoint/me` is the
        shortcut around list redaction otherwise — same rule applies here).
        """
        checkpoint = await self._checkpoint_crud.get_next(db=self._db, team_id=team_id)
        if checkpoint is None:
            return None
        validated = DetailedCheckPoint.model_validate(checkpoint)
        if getattr(settings, "reveal_next_checkpoint", True):
            return validated
        arrived_ids = (
            await self._arrived_checkpoint_ids(team_id)
            if getattr(settings, "reveal_on_arrival", True)
            else set()
        )
        return self._redact_unreached(
            validated,
            current_order=validated.order,
            has_arrived=validated.id in arrived_ids,
            search_radius_m=int(getattr(settings, "search_radius_m", 0) or 0),
        )

    async def visible_checkpoints_for_team(
        self, team_id: int, settings: Any
    ) -> list[DetailedCheckPoint]:
        """Return visible checkpoints for a team member.

        ``show_route_mode == "complete"`` still respects ``reveal_next_checkpoint``:
        seeing the whole route is a display preference, not license to skip
        redaction of checkpoints the team hasn't reached.
        """
        all_checkpoints = await self._checkpoint_crud.get_all_ordered(db=self._db)
        # NOTE: CRUDBase.get() raises RallyNotFoundError itself for a missing id
        # rather than returning None, so this branch is unreachable in practice
        # (a stale team_id 404s before reaching here); kept as a defensive guard.
        team = await self._team_crud.get(db=self._db, id=team_id)
        if not team:
            return []

        _, current_order, _ = await TeamService(
            self._db, self._team_crud
        ).compute_checkpoint_progress(team)
        reveal_next = getattr(settings, "reveal_next_checkpoint", True)
        # Skipped entirely when nothing is redacted anyway, so a rally does not
        # pay for a query it cannot use.
        arrived_ids = (
            frozenset()
            if reveal_next or not getattr(settings, "reveal_on_arrival", True)
            else frozenset(await self._arrived_checkpoint_ids(team_id))
        )
        search_radius = int(getattr(settings, "search_radius_m", 0) or 0)

        # Under stages there is no single "current" post: an ordered stage has
        # one, a free stage has several at once. Both sets are computed here
        # and handed to the redactor, which otherwise compares against a
        # single order.
        stage_sets = await self._stage_reveal_sets(team, settings)

        if settings.show_route_mode == "complete":
            return self._redact_list(
                all_checkpoints,
                current_order=current_order,
                reveal_next=reveal_next,
                arrived_ids=arrived_ids,
                search_radius_m=search_radius,
                **stage_sets,
            )

        if stage_sets:
            # Everything the team has finished, plus everything it may head to
            # now. Posts locked behind a later stage stay out of the list.
            open_orders = stage_sets["current_orders"] | stage_sets["resolved_orders"]
            visible = [cp for cp in all_checkpoints if cp.order in open_orders]
        elif getattr(settings, "checkpoint_order_matters", True):
            visible = [cp for cp in all_checkpoints if cp.order <= current_order]
        else:
            # Free order: a team can reach checkpoint 3 before 2, but a
            # sequential prefix would hide that it exists at all. Every
            # checkpoint is visible — completed ones pass through, the rest
            # stay redacted until reached.
            visible = list(all_checkpoints)
        return self._redact_list(
            visible,
            current_order=current_order,
            reveal_next=reveal_next,
            arrived_ids=arrived_ids,
            search_radius_m=search_radius,
            **stage_sets,
        )

    async def _stage_reveal_sets(self, team: Any, settings: Any) -> dict[str, frozenset[int]]:
        """``{"current_orders", "resolved_orders"}`` when the event runs on
        stages, or an empty dict when it does not.

        Empty means "fall back to the sequential comparison", which is what
        every event without stages has always done — the redactor and the
        visibility filter both read it that way.
        """
        if not getattr(settings, "route_stages_enabled", False):
            return {}
        stages = await load_stages(self._db)
        if not stages:
            return {}

        resolved = await resolved_checkpoint_orders(self._db, team)
        reachable = frozenset(
            order
            for stage in stages
            for order in stage.checkpoint_orders
            if is_reachable_in_stages(
                checkpoint_order=order, stages=stages, resolved_orders=resolved
            )
        )
        return {"current_orders": reachable, "resolved_orders": resolved}

    async def visible_checkpoints_for_public(
        self, settings: Any
    ) -> list[DetailedCheckPoint] | None:
        """Return visible checkpoints for unauthenticated / public access.

        ``show_checkpoint_map`` decides whether the route is public at all;
        ``show_route_mode`` decides how much of it is revealed. Focused mode
        exposes only the first post — progressive route reveal is the whole game
        in peddy paper, so it is honored on every path that returns data.

        Returns *None* when access should be denied.
        """
        if not settings.show_checkpoint_map:
            return None

        all_checkpoints = await self._checkpoint_crud.get_all_ordered(db=self._db)
        subset = all_checkpoints[:1] if settings.show_route_mode == "focused" else all_checkpoints
        reveal_next = getattr(settings, "reveal_next_checkpoint", True)
        # Public access has no team, hence no notion of "already completed" —
        # every checkpoint is redacted as if unreached when redaction is on.
        return self._redact_list(subset, current_order=0, reveal_next=reveal_next)

    async def team_can_view_media(self, team_id: int, checkpoint_id: int, settings: Any) -> bool:
        """Whether a team's own token may see a checkpoint's media (photos,
        fun facts). Media is a stronger reveal than the redacted list entry —
        it must never be visible for a checkpoint the team hasn't reached.

        Reached, not completed: arriving is what earns the photos of the place,
        the same rule ``_redact_unreached`` applies. A post with an activity
        stays uncompleted until staff scores it, and the team is already there.
        """
        team = await self._team_crud.get(db=self._db, id=team_id)
        if not team:
            return False
        checkpoint = await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)
        if checkpoint is None:
            return False

        if getattr(settings, "reveal_on_arrival", True) and checkpoint_id in (
            await self._arrived_checkpoint_ids(team_id)
        ):
            return True

        _, current_order, _ = await TeamService(
            self._db, self._team_crud
        ).compute_checkpoint_progress(team)
        if checkpoint.order < current_order:
            return True
        if checkpoint.order == current_order:
            return getattr(settings, "reveal_next_checkpoint", True)
        return False

    async def public_can_view_media(self, checkpoint_id: int, settings: Any) -> bool:
        """Whether an unauthenticated visitor may see a checkpoint's media."""
        if not settings.show_checkpoint_map or not getattr(
            settings, "reveal_next_checkpoint", True
        ):
            return False
        if settings.show_route_mode != "focused":
            return True
        checkpoint = await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)
        return checkpoint is not None and checkpoint.order == 1

    async def list_teams_at_checkpoint(
        self, *, checkpoint_id: int, is_admin_unfiltered: bool
    ) -> list[ListingTeam]:
        """Teams currently at (or having passed through) a checkpoint.

        ``is_admin_unfiltered`` selects every team regardless of checkpoint
        when an admin passed no ``checkpoint_id`` filter.
        """
        if is_admin_unfiltered:
            teams = (await self._db.scalars(select(Team).options(selectinload(Team.members)))).all()
        else:
            teams = await self._team_crud.get_by_checkpoint(
                db=self._db, checkpoint_id=checkpoint_id
            )

        return [
            ListingTeam(
                id=team.id,
                name=team.name,
                total=team.total,
                classification=team.classification,
                versus_group_id=team.versus_group_id,
                start_offset_minutes=team.start_offset_minutes or 0,
                times=team.times,
                last_checkpoint_time=team.last_checkpoint_time,
                last_checkpoint_score=team.last_checkpoint_score,
                num_members=team.num_members,
                last_checkpoint_number=None,
                last_checkpoint_name=None,
                current_checkpoint_number=None,
            )
            for team in teams
        ]

    async def _checkpoint_ids_with_activity(self) -> set[int]:
        stmt = select(Activity.checkpoint_id).where(
            Activity.checkpoint_id.is_not(None), Activity.is_active.is_(True)
        )
        return {cid for cid in (await self._db.scalars(stmt)).all() if cid is not None}

    async def _checkpoint_ids_with_staff(self) -> set[int]:
        stmt = select(RallyStaffAssignment.checkpoint_id)
        return set((await self._db.scalars(stmt)).all())

    async def route_status(self, settings: Any) -> RouteStatus:
        """The admin planning view: every post including drafts, each with the
        list of fields it still lacks.

        What counts as missing depends on how the event runs — a post with no
        coordinates is fine in a guided rally and unreachable when teams check
        themselves in by GPS, and a riddle only matters when the route is
        redacted. Both are read from settings rather than assumed.
        """
        checkpoints = await self._checkpoint_crud.get_all_ordered(db=self._db, include_drafts=True)
        with_activity = await self._checkpoint_ids_with_activity()
        with_staff = await self._checkpoint_ids_with_staff()
        requires_coordinates = bool(getattr(settings, "gps_checkin_enabled", False))
        requires_clue = not getattr(settings, "reveal_next_checkpoint", True)
        requires_stage = bool(getattr(settings, "route_stages_enabled", False))

        adapter = TypeAdapter(list[AdminCheckPoint])
        validated = adapter.validate_python(checkpoints)
        by_id = {cp.id: cp for cp in checkpoints}
        for item in validated:
            item.missing = missing_fields(
                by_id[item.id],
                has_activity=item.id in with_activity,
                has_staff=item.id in with_staff,
                requires_coordinates=requires_coordinates,
                requires_clue=requires_clue,
                requires_stage=requires_stage,
            )

        return RouteStatus(
            published_count=sum(1 for cp in validated if not cp.is_draft),
            draft_count=sum(1 for cp in validated if cp.is_draft),
            incomplete_published_ids=[cp.id for cp in validated if not cp.is_draft and cp.missing],
            checkpoints=validated,
        )

    async def _event_has_started(self) -> bool:
        """Whether any team has already checked in.

        Publishing or drafting a post renumbers the route, and progress is
        positional (``team.times`` is indexed by order), so moving posts
        around under a team that has already walked part of the route would
        silently rewrite where it has been.
        """
        return bool(await self._db.scalar(select(CheckpointArrival.id).limit(1)))

    async def set_draft(self, checkpoint_id: int, *, is_draft: bool) -> AdminCheckPoint:
        """Publish a draft post, or pull a published one back into planning."""
        checkpoint = await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)
        if checkpoint.is_draft == is_draft:
            return AdminCheckPoint.model_validate(checkpoint)
        if await self._event_has_started():
            raise RallyValidationError(
                "Cannot change a checkpoint's draft state after teams have started"
            )
        checkpoint.is_draft = is_draft
        await self._db.flush()
        await self._checkpoint_crud.resequence(self._db, commit=True)
        await self._db.refresh(checkpoint)
        return AdminCheckPoint.model_validate(checkpoint)

    async def delete_checkpoint(self, checkpoint_id: int) -> None:
        """Delete a checkpoint and everything that references it: staff/guide
        assignments, and staff members' assigned-checkpoint pointer."""
        await self._db.execute(
            delete(RallyStaffAssignment).where(RallyStaffAssignment.checkpoint_id == checkpoint_id)
        )
        await self._db.execute(
            delete(RallyGuideAssignment).where(RallyGuideAssignment.checkpoint_id == checkpoint_id)
        )
        await self._db.execute(
            update(User)
            .where(User.staff_checkpoint_id == checkpoint_id)
            .values(staff_checkpoint_id=None)
        )
        await self._checkpoint_crud.remove(db=self._db, id=checkpoint_id, commit=False)
        await self._db.commit()
