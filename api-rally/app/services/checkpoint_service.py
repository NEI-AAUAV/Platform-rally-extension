"""Business rules for checkpoints: visibility, teams-at-checkpoint listing,
and cascading delete. Moved out of app.api.api_v1.checkpoint, which used to
hold this logic inline in the router handlers.
"""

import math
from collections.abc import Sequence
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import RallyValidationError
from app.crud._event_scope import current_event_id
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_team import CRUDTeam
from app.models.activity import Activity, ActivityResult
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_skip import CheckpointSkip
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
from app.services.route_progress import TeamProgress
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
        resolved_orders: frozenset[int],
        open_orders: frozenset[int],
        has_arrived: bool = False,
        search_radius_m: int = 0,
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

        The ``clue`` survives redaction, but **only for the posts the team may
        head to now** (``open_orders``). A riddle describes its place well
        enough that anyone who knows the city can read it and skip straight
        there, so handing over the whole route's riddles at once lets a team
        solve post 4 while standing at post 1. One riddle at a time is the
        game — or, in a free-choice stage, one riddle per genuinely open post.
        It is also mirrored into ``description`` so clients that only render the
        description still show something.

        The **search area is gated on the same set**, and for the same reason.
        A circle the post is guaranteed to sit inside narrows the city to a
        neighbourhood, so drawing one for every future post hands the team the
        shape of the whole route on a map before it has solved a single riddle
        — enough to plan transport, pre-position half the team at post 4, and
        turn each riddle into a lookup once it finally arrives. Withholding the
        riddle while publishing its neighbourhood is not withholding much.

        Both sets come from ``route_progress.progress_for_team``. "Resolved"
        is deliberately a set membership and not ``order < current_order``:
        under free order or stages a team resolves posts out of sequence, and
        the comparison censored a post the team had already finished.
        Unauthenticated callers pass two empty sets, so nothing is resolved and
        nothing is open.
        """
        if checkpoint.order in resolved_orders or has_arrived:
            return checkpoint
        is_current = checkpoint.order in open_orders
        area = CheckpointService._search_area(checkpoint, search_radius_m) if is_current else None
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
        resolved_orders: frozenset[int],
        open_orders: frozenset[int],
        reveal_next: bool,
        arrived_ids: frozenset[int] = frozenset(),
        search_radius_m: int = 0,
    ) -> list[DetailedCheckPoint]:
        """Stamp ``is_reachable`` on every post, then redact the unreached ones.

        ``is_reachable`` is set on the revealed path too: a fully-visible rally
        can still run free-choice stages, and the team's screen has no other
        way to know that more than one post is open.
        """
        validated = [
            cp.model_copy(update={"is_reachable": cp.order in open_orders})
            for cp in self._validate_list(checkpoints)
        ]
        if reveal_next:
            return validated
        return [
            self._redact_unreached(
                cp,
                resolved_orders=resolved_orders,
                open_orders=open_orders,
                has_arrived=cp.id in arrived_ids,
                search_radius_m=search_radius_m,
            )
            for cp in validated
        ]

    async def all_checkpoints(self) -> list[DetailedCheckPoint]:
        """Every checkpoint in the current event, ordered — the admin/staff view."""
        return self._validate_list(await self._checkpoint_crud.get_all_ordered(db=self._db))

    async def _progress_for_team(self, team: Team) -> TeamProgress:
        """The canonical progress snapshot, via ``TeamService``.

        ``route_progress.progress_for_team`` is still the single engine, but
        ``CheckpointService`` now gets at it the same way the participant
        payloads do, through ``TeamService.progress``. That keeps `/checkpoint/me`
        and `/team/*` on one service-level entry point as well as one engine.
        """
        return await TeamService(self._db, self._team_crud).progress(team)

    async def next_checkpoint_for_team(
        self, team_id: int, settings: Any, *, redact: bool = True
    ) -> DetailedCheckPoint | None:
        """The single next checkpoint a team must head to, redacted like
        everything else in the list view (`GET /checkpoint/me` is the
        shortcut around list redaction otherwise — same rule applies here).

        "Next" is the first post not yet resolved (arrival / skip / scored
        activity), matching ``compute_checkpoint_progress`` — not
        ``len(team.times)``, which the staff-eval advance inflates by one.

        ``redact=False`` is the staff/admin bypass: the post is returned
        exactly as stored.
        """
        team = await self._team_crud.get(db=self._db, id=team_id)
        if team is None:
            return None
        progress = await self._progress_for_team(team)
        if progress.current_order is None:
            return None
        checkpoint = await self._checkpoint_crud.get_by_order(
            db=self._db, order=progress.current_order
        )
        if checkpoint is None:
            return None
        validated = DetailedCheckPoint.model_validate(checkpoint).model_copy(
            update={"is_reachable": True}
        )
        if redact is False or getattr(settings, "reveal_next_checkpoint", True):
            return validated
        arrived_ids = (
            await self._arrived_checkpoint_ids(team_id)
            if getattr(settings, "reveal_on_arrival", True)
            else set()
        )
        return self._redact_unreached(
            validated,
            resolved_orders=progress.resolved_orders,
            open_orders=progress.open_orders,
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

        progress = await self._progress_for_team(team)
        reveal_next = getattr(settings, "reveal_next_checkpoint", True)
        # Skipped entirely when nothing is redacted anyway, so a rally does not
        # pay for a query it cannot use.
        arrived_ids = (
            frozenset()
            if reveal_next or not getattr(settings, "reveal_on_arrival", True)
            else frozenset(await self._arrived_checkpoint_ids(team_id))
        )
        search_radius = int(getattr(settings, "search_radius_m", 0) or 0)

        visible = self._visible_subset(all_checkpoints, settings, progress)
        return self._redact_list(
            visible,
            resolved_orders=progress.resolved_orders,
            open_orders=progress.open_orders,
            reveal_next=reveal_next,
            arrived_ids=arrived_ids,
            search_radius_m=search_radius,
        )

    @staticmethod
    def _visible_subset(
        all_checkpoints: Sequence[Any], settings: Any, progress: TeamProgress
    ) -> list[Any]:
        """Which rows the team's route list contains at all.

        ``complete`` mode lists everything (still redacted). Otherwise the list
        is what the team has finished plus what it may head to now — which for
        a sequential route is the familiar prefix, for a free-order route is
        every post, and for a staged route leaves the posts locked behind a
        later stage out entirely.
        """
        if settings.show_route_mode == "complete":
            return list(all_checkpoints)
        if progress.is_finished:
            return list(all_checkpoints)
        shown = progress.resolved_orders | progress.open_orders
        return [cp for cp in all_checkpoints if cp.order in shown]

    async def visible_checkpoints_for_public(
        self, settings: Any
    ) -> list[DetailedCheckPoint] | None:
        """Return visible checkpoints for unauthenticated / public access.

        ``public_access_enabled`` decides whether an unauthenticated caller is
        served at all, ``show_checkpoint_map`` whether the route is one of the
        things they get, and ``show_route_mode`` how much of it is revealed.
        Focused mode exposes only the first post — progressive route reveal is
        the whole game in peddy paper, so it is honored on every path that
        returns data.

        The first switch was checked only by ``/checkpoint/count``, so turning
        public access off left the full route listing open; with
        ``reveal_next_checkpoint`` on and a complete route mode, that is every
        post's name, description and exact coordinates to anyone at all.

        Returns *None* when access should be denied.
        """
        if not settings.public_access_enabled or not settings.show_checkpoint_map:
            return None

        all_checkpoints = await self._checkpoint_crud.get_all_ordered(db=self._db)
        subset = all_checkpoints[:1] if settings.show_route_mode == "focused" else all_checkpoints
        reveal_next = getattr(settings, "reveal_next_checkpoint", True)
        # Public access has no team, hence no notion of "already completed" and
        # nothing open — every checkpoint is redacted as if unreached when
        # redaction is on, and none of them carries a riddle.
        return self._redact_list(
            subset,
            resolved_orders=frozenset(),
            open_orders=frozenset(),
            reveal_next=reveal_next,
        )

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

        progress = await self._progress_for_team(team)
        if checkpoint.order in progress.resolved_orders:
            return True
        if checkpoint.order in progress.open_orders:
            return getattr(settings, "reveal_next_checkpoint", True)
        return False

    async def public_can_view_media(self, checkpoint_id: int, settings: Any) -> bool:
        """Whether an unauthenticated visitor may see a checkpoint's media.

        Scoped to the same subset the public route listing returns, rather than
        the all-or-nothing check this used to be: outside focused mode it
        answered True for *any* checkpoint id, which handed the whole route's
        gallery to an unauthenticated caller.
        """
        if not settings.show_checkpoint_map or not getattr(
            settings, "reveal_next_checkpoint", True
        ):
            return False
        if not getattr(settings, "public_access_enabled", False):
            return False
        checkpoint = await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)
        if checkpoint is None or checkpoint.is_draft:
            return False
        if settings.show_route_mode == "focused":
            return checkpoint.order == 1
        return True

    async def list_teams_at_checkpoint(
        self, *, checkpoint_id: int, is_admin_unfiltered: bool
    ) -> list[ListingTeam]:
        """Teams currently at (or having passed through) a checkpoint.

        ``is_admin_unfiltered`` selects every team regardless of checkpoint
        when an admin passed no ``checkpoint_id`` filter — scoped to the
        current edition, which it was not: an unfiltered ``select(Team)``
        returned every team the deployment had ever had.

        Progress fields are filled in rather than left ``None``. They share the
        ``ListingTeam`` schema with ``TeamService.build_listing_team``, and a
        response where half the callers populate a field and half send null is
        two meanings for one contract.
        """
        if is_admin_unfiltered:
            event_id = await current_event_id(self._db)
            teams = (
                await self._db.scalars(
                    select(Team)
                    .where((Team.event_id == event_id) | (Team.event_id.is_(None)))
                    .options(selectinload(Team.members))
                )
            ).all()
        else:
            teams = await self._team_crud.get_by_checkpoint(
                db=self._db, checkpoint_id=checkpoint_id
            )

        # Staff-facing, so the name of a post another team has reached is not a
        # secret to withhold here.
        team_service = TeamService(self._db, self._team_crud)
        return [await team_service.build_listing_team(team, is_privileged=True) for team in teams]

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
        """Whether any team has already checked in **in the current edition**.

        Publishing or drafting a post renumbers the route, and progress is
        positional (``team.times`` is indexed by order), so moving posts
        around under a team that has already walked part of the route would
        silently rewrite where it has been.

        Scoped to the current event's posts, which it originally was not: an
        unfiltered "does any arrival exist" is true forever once a single
        edition has run, so from the second year on nobody could publish or
        unpublish a draft post while planning the next route. The rule is
        about *this* edition's teams being under way, not about the
        organization ever having run an event.

        "Under way" is more than a GPS arrival. A rally run purely through
        staff evaluation writes no ``CheckpointArrival`` at all, so this used
        to answer False for the whole event and let posts be published or
        drafted — firing a resequence — while teams were mid-route. A skip, a
        scored result, or any recorded visit counts just the same.
        """
        event_id = await current_event_id(self._db)
        event_posts = select(CheckPoint.id).where(
            (CheckPoint.event_id == event_id) | (CheckPoint.event_id.is_(None))
        )
        event_teams = (Team.event_id == event_id) | (Team.event_id.is_(None))

        signals = (
            select(CheckpointArrival.id).where(CheckpointArrival.checkpoint_id.in_(event_posts)),
            select(CheckpointSkip.id).where(CheckpointSkip.checkpoint_id.in_(event_posts)),
            select(ActivityResult.id)
            .join(Activity, Activity.id == ActivityResult.activity_id)
            .where(Activity.checkpoint_id.in_(event_posts)),
            select(Team.id).where(event_teams, func.cardinality(Team.times) > 0),
        )
        for stmt in signals:
            if await self._db.scalar(stmt.limit(1)):
                return True
        return False

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
        """Delete a checkpoint and everything that references it: the staff
        assignment pointing at it, and staff members' assigned-checkpoint
        pointer. Guide assignments point at a team, not a checkpoint, so
        deleting a post never touches them.

        The route is renumbered afterwards, as it already is on create and on
        reorder. Deleting post 2 of 4 used to leave the orders as 1, 3, 4:
        progress is read by order, ``current_order`` can then name a number no
        post has, and ``get_by_order`` returning None made ``/checkpoint/me``
        answer 404 for every team on the route."""
        await self._db.execute(
            delete(RallyStaffAssignment).where(RallyStaffAssignment.checkpoint_id == checkpoint_id)
        )
        await self._db.execute(
            update(User)
            .where(User.staff_checkpoint_id == checkpoint_id)
            .values(staff_checkpoint_id=None)
        )
        await self._checkpoint_crud.remove(db=self._db, id=checkpoint_id, commit=False)
        await self._checkpoint_crud.resequence(self._db, commit=False)
        await self._db.commit()
