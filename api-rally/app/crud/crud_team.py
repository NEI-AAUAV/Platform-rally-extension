import re
import secrets
import string
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import RallyValidationError
from app.crud._event_scope import current_event_id
from app.crud.base import CRUDBase
from app.crud.crud_rally_settings import rally_settings
from app.db.locks import lock_team_ranking
from app.models.activity import RallyEvent
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.team import Team
from app.schemas.team import (
    TeamCreate,
    TeamScoresUpdate,
    TeamUpdate,
)

locked_arrays = [
    "times",
    "question_scores",
    "time_scores",
    "pukes",
    "skips",
]

# Matches the composite (event_id, name) unique constraint by its Postgres
# constraint name, not column list — asyncpg reports "Key (event_id, name)=(...)
# already exists" for composite constraints, which unique_key_error_regex's
# single-column pattern does not match.
_name_unique_error_regex = re.compile(r"uq_team_event_name")


async def _generate_access_code(db: AsyncSession) -> str:
    """Generate a unique, human-readable 8-character code (XXXX-XXXX) for a team."""
    while True:
        part1 = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        part2 = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        code = f"{part1}-{part2}"

        # Check for uniqueness in the database
        existing = await db.scalar(select(Team).where(Team.access_code == code))
        if existing is None:
            return code


class CRUDTeam(CRUDBase[Team, TeamCreate, TeamUpdate]):
    def calculate_min_time_scores(self, teams: Sequence[Team]) -> list[float]:
        """Delegates to TeamService — kept here so existing callers (and the
        test suite) don't need to construct a service just for pure math."""
        # Local import: avoids circular import with app.services.team_service
        from app.services.team_service import TeamService

        return TeamService.calculate_min_time_scores(teams)

    async def get_by_access_code(self, db: AsyncSession, *, access_code: str) -> Team | None:
        """Get a team by their access code (access_code is globally unique)."""
        result: Team | None = await db.scalar(select(Team).where(Team.access_code == access_code))
        return result

    async def get_current_event(self, db: AsyncSession) -> RallyEvent:
        """Return the active edition without changing it during normal login."""
        event = await db.scalar(select(RallyEvent).where(RallyEvent.is_current.is_(True)))
        if event is None:
            # Preserve the long-standing lazy bootstrap for legacy deployments.
            event = await db.get(RallyEvent, await current_event_id(db))
        assert event is not None
        return event

    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: int | None = None,
        limit: int | None = None,
        for_update: bool = False,
    ) -> Sequence[Team]:
        """List teams scoped to the current event.

        Ranking and listing operate per-edition: only teams whose event_id
        matches the current event are returned. Legacy rows with event_id NULL
        are folded into the current event so single-event data keeps showing.
        """
        event_id = await current_event_id(db)
        stmt = (
            select(Team)
            .where((Team.event_id == event_id) | (Team.event_id.is_(None)))
            .limit(limit)
            .offset(skip)
        )
        if for_update:
            # Mutual exclusion for whole-team-set writes is the advisory gate,
            # not row locks. A row-level FOR UPDATE here conflicts with the
            # KEY SHARE lock that any INSERT referencing teams takes on its
            # parent row (a checkpoint arrival, an activity result), so a
            # transaction that inserted one of those and then reached this gate
            # deadlocked against the gate holder scanning the same row. Under
            # the gate only one writer runs at a time, so the row locks bought
            # nothing but that cycle. Ordering stays for a deterministic read.
            await lock_team_ranking(db, event_id)
            # populate_existing replaces what FOR UPDATE also did for free:
            # overwrite any copy of these rows already in the session's
            # identity map. Without it a caller that read a team earlier in the
            # same request re-ranks from that stale copy.
            #
            # Flush first: the session runs with autoflush=False, so pending
            # in-memory changes (a score this transaction has just computed)
            # would otherwise be overwritten by the re-read and lost. Flushing
            # sends them to the database, so the fresh read returns this
            # transaction's own writes instead of discarding them.
            await db.flush()
            stmt = stmt.order_by(Team.id).execution_options(populate_existing=True)
        return list((await db.scalars(stmt)).all())

    async def update_classification_unlocked(self, db: AsyncSession) -> None:
        """Delegates to TeamService — kept here so existing callers (and the
        test suite) don't need to construct a service directly."""
        # Local import: avoids circular import with app.services.team_service
        from app.services.team_service import TeamService

        await TeamService(db, self).update_classification_unlocked()

    async def update_classification(self, db: AsyncSession) -> None:
        """Delegates to TeamService (see update_classification_unlocked)."""
        # Local import: avoids circular import with app.services.team_service
        from app.services.team_service import TeamService

        await TeamService(db, self).update_classification()

    async def reassign_ranks_unlocked(self, db: AsyncSession) -> None:
        """Re-rank from persisted totals only (no score recompute). Kept here
        so ScoringService can reach it without importing team_service at module
        level (that side of the cycle must stay lazy)."""
        # Local import: avoids circular import with app.services.team_service
        from app.services.team_service import TeamService

        await TeamService(db, self).reassign_ranks_unlocked()

    async def create(self, db: AsyncSession, *, obj_in: TeamCreate, commit: bool = False) -> Team:
        settings = await rally_settings.get_or_create(db)
        event_id = await current_event_id(db)
        # Count teams in the current event only, so max_teams is per-edition.
        current_team_count = await db.scalar(
            select(func.count(Team.id)).where(
                (Team.event_id == event_id) | (Team.event_id.is_(None))
            )
        )

        if current_team_count >= settings.max_teams:
            raise RallyValidationError("Team limit reached")

        # Same gate as update(): this insert is followed by a whole-set re-rank,
        # so the gate must come before the row this transaction writes.
        await lock_team_ranking(db, event_id)
        obj_in_data = obj_in.model_dump()
        obj_in_data["access_code"] = await _generate_access_code(db)
        obj_in_data["event_id"] = event_id

        team = self.model(**obj_in_data)

        # The INSERT must be isolated from an outer transaction.  A caller that
        # asked for commit=False owns that transaction, so a uniqueness failure
        # here may roll back only this INSERT, never unrelated work already queued
        # on the session.  Keep the flush inside the SAVEPOINT so PostgreSQL can
        # evaluate the unique constraints there.
        try:
            async with db.begin_nested():
                db.add(team)
                await db.flush()
        except IntegrityError as e:
            if e.orig is None:
                raise

            if _name_unique_error_regex.search(str(e.orig)) is not None:
                raise RallyValidationError("Team name already exists") from e

            raise

        # Re-rank with the new team included. Not swallowed: a silent failure
        # here used to leave the team at classification -1, which the frontend
        # sorts to the *top* (ahead of rank 1). Better to fail the create than
        # to publish a phantom leader.
        await self.update_classification_unlocked(db=db)

        if commit:
            await db.commit()
        else:
            await db.flush()
        await db.refresh(team)
        return team

    async def update(
        self, db: AsyncSession, *, id: int, obj_in: TeamUpdate, commit: bool = False
    ) -> Team:
        # The gate serializes every writer of the team set (see
        # app.db.locks), so this read needs no row lock of its own — one would
        # only reintroduce the conflict with FK KEY SHARE locks.
        await lock_team_ranking(db, await current_event_id(db))
        async with db.begin_nested():
            team = await self.get(db=db, id=id, populate_existing=True)
            update_data = obj_in.model_dump(exclude_unset=True)

            # The access code is a login credential. Rotating it must revoke
            # every access/refresh JWT issued with the old code immediately.
            if "access_code" in update_data and update_data["access_code"] != team.access_code:
                team.auth_version += 1

            should_validate_locked = any(key in update_data for key in locked_arrays)

            if should_validate_locked:
                last_size = None
                for key in locked_arrays:
                    value = update_data.get(key, getattr(team, key))
                    if value is None:
                        continue

                    size = len(value)
                    if last_size is not None and last_size != size:
                        raise RallyValidationError("Lists must have the same size")

                    last_size = size

            team = super().update_unlocked(db_obj=team, obj_in=obj_in)

        await self.update_classification_unlocked(db=db)

        if commit:
            await db.commit()
        else:
            await db.flush()
        await db.refresh(team)
        return team

    async def set_photo_url(self, db: AsyncSession, *, id: int, url: str) -> Team:
        """Persist the team's official photo URL.

        Kept separate from ``update`` so the R2 upload endpoint is the only
        writer of ``photo_url`` (mirrors rally_settings.set_image_url).
        """
        team = await self.get(db=db, id=id)
        team.photo_url = url
        await db.commit()
        await db.refresh(team)
        return team

    async def add_checkpoint(
        self,
        db: AsyncSession,
        *,
        id: int,
        checkpoint_id: int,
        obj_in: TeamScoresUpdate,
        enforce_order: bool = True,
        commit: bool = True,
    ) -> Team:
        """Delegates to TeamService — kept here so existing callers (and the
        test suite) don't need to construct a service directly."""
        # Local import: avoids circular import with app.services.team_service
        from app.services.team_service import TeamService

        return await TeamService(db, self).add_checkpoint(
            id=id,
            checkpoint_id=checkpoint_id,
            obj_in=obj_in,
            enforce_order=enforce_order,
            commit=commit,
        )

    async def get_by_checkpoint(self, db: AsyncSession, checkpoint_id: int) -> Sequence[Team]:
        """Teams that have checked in at this checkpoint.

        Read from ``CheckpointArrival``, which names the post. This used to be
        ``cardinality(team.times) == checkpoint.order`` — a count, not an
        identity, so it answered "teams that have made N visits" and silently
        disagreed with the guide's panel (which has always read arrivals) as
        soon as a route ran out of strict sequence or the staff-eval advance
        inflated the array by one.

        Eager-loads members so callers can read ``team.members`` without a lazy
        load. Scoped to the current event so editions never leak into each
        other (legacy NULL rows count as current, same as ``list()``).
        """
        event_id = await current_event_id(db)
        stmt = (
            select(Team)
            .join(CheckpointArrival, CheckpointArrival.team_id == Team.id)
            .where(
                CheckpointArrival.checkpoint_id == checkpoint_id,
                (Team.event_id == event_id) | (Team.event_id.is_(None)),
            )
            .options(selectinload(Team.members))
            .order_by(CheckpointArrival.arrived_at)
        )
        return (await db.scalars(stmt)).all()


team = CRUDTeam(Team)
