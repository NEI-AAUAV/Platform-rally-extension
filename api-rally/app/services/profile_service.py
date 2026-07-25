"""Business rules for per-person profiles: participation-history building,
lazy participation recording, and claiming a placeholder team member onto
the caller's OIDC account.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api.auth import AuthData
from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.models.participation import EventParticipation
from app.models.team import Team
from app.models.user import User
from app.schemas.profile import ClaimableTeam, ParticipationEntry


class ProfileService:
    """Participation history, lazy recording, and member-claim lifecycle."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def build_entry(self, row: EventParticipation) -> ParticipationEntry:
        """Build a participation entry, preferring live team values over snapshots."""
        event = await crud.rally_event.get(self._db, row.event_id)
        team = await self._db.get(Team, row.team_id) if row.team_id is not None else None
        return ParticipationEntry(
            event_id=row.event_id,
            event_name=event.name if event else (row.team_name or "Evento"),
            event_type=event.event_type if event else "generic",
            team_id=row.team_id,
            team_name=team.name if team else row.team_name,
            team_total=team.total if team else row.team_total,
            team_classification=team.classification if team else row.team_classification,
            is_captain=row.is_captain,
            joined_at=row.joined_at,
        )

    async def get_self(self, auth: AuthData) -> User | None:
        return await crud.user.get_by_authentik_sub(self._db, authentik_sub=auth.oidc_sub)

    async def record_current_participation_if_on_team(
        self, me: User | None, auth: AuthData
    ) -> None:
        """Lazily record participation in the current event when the caller is
        directly on a team, so the active edition always shows on their profile."""
        if me is None or me.team_id is None:
            return
        team = await self._db.get(Team, me.team_id)
        if team is None:
            return
        await crud.participation.record(
            self._db,
            authentik_sub=auth.oidc_sub,
            event_id=team.event_id or (await crud.rally_event.ensure_current(self._db)).id,
            team=team,
            is_captain=bool(me.is_captain),
        )

    async def get_participation_history(self, auth: AuthData) -> list[ParticipationEntry]:
        rows = await crud.participation.get_for_sub(self._db, authentik_sub=auth.oidc_sub)
        return [await self.build_entry(r) for r in rows]

    async def get_claimable_team(self, access_code: str) -> ClaimableTeam:
        """List a team's name-only members (by access code) the caller can claim."""
        from app.schemas.profile import ClaimableMember

        team = await crud.team.get_by_access_code(self._db, access_code=access_code.strip())
        if team is None:
            raise RallyNotFoundError("Team not found")

        stmt = select(User).where(User.team_id == team.id, User.authentik_sub.is_(None))
        members = list((await self._db.scalars(stmt)).all())
        return ClaimableTeam(
            team_id=team.id,
            team_name=team.name,
            members=[ClaimableMember.model_validate(m) for m in members],
        )

    async def claim_membership(self, member_user_id: int, auth: AuthData) -> ParticipationEntry:
        """Claim a name-only team member as the caller's own participation.

        The placeholder member (a ``user`` row with no authentik_sub) is merged
        into the caller's account: its team membership moves to the caller and
        the placeholder is removed. A participation row is recorded for the event.
        """
        member = await self._db.get(User, member_user_id)
        if member is None:
            raise RallyNotFoundError("Member not found")
        if member.authentik_sub is not None:
            raise RallyValidationError("This member is already linked to an account")
        if member.team_id is None:
            raise RallyValidationError("This member is not on a team")

        team = await self._db.get(Team, member.team_id)
        if team is None:
            raise RallyNotFoundError("Team not found")

        me = await self.get_self(auth)
        if me is None:
            # First login may not have created the row yet; create it now.
            me = await crud.user.create_for_oidc(
                self._db,
                authentik_sub=auth.oidc_sub,
                name=auth.name,
                email=auth.email,
                scopes=auth.scopes,
            )

        # Move the team membership onto the caller, drop the placeholder.
        me.team_id = member.team_id
        me.is_captain = bool(member.is_captain)
        self._db.add(me)
        await self._db.delete(member)
        await self._db.flush()

        row = await crud.participation.record(
            self._db,
            authentik_sub=auth.oidc_sub,
            event_id=team.event_id or (await crud.rally_event.ensure_current(self._db)).id,
            team=team,
            is_captain=bool(me.is_captain),
            commit=False,
        )
        await self._db.commit()
        await self._db.refresh(row)
        return await self.build_entry(row)
