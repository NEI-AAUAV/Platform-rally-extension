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

from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_team import CRUDTeam
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.models.team import Team
from app.models.user import User
from app.schemas.checkpoint import DetailedCheckPoint
from app.schemas.team import ListingTeam
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

        The ``clue`` survives redaction — it is the riddle *pointing at* the
        location, not the location itself, and is the only thing a team is
        meant to have before arriving. It is also mirrored into ``description``
        so clients that only render the description still show something.
        """
        if checkpoint.order < current_order or has_arrived:
            return checkpoint
        area = CheckpointService._search_area(checkpoint, search_radius_m)
        return checkpoint.model_copy(
            update={
                "name": f"Posto {checkpoint.order}",
                "description": checkpoint.clue,
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

        if settings.show_route_mode == "complete":
            return self._redact_list(
                all_checkpoints,
                current_order=current_order,
                reveal_next=reveal_next,
                arrived_ids=arrived_ids,
                search_radius_m=search_radius,
            )

        if getattr(settings, "checkpoint_order_matters", True):
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
        )

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
