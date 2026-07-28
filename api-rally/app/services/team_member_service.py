"""Business rules for team roster management: member limits, captain
uniqueness, and linking placeholder members to real NEI (OIDC) accounts.
Moved out of app.api.api_v1.team_members, which used to hold this logic
inline in the router handlers.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.core.exceptions import RallyForbiddenError, RallyNotFoundError, RallyValidationError
from app.crud.crud_rally_settings import rally_settings
from app.models.team import Team
from app.models.user import User
from app.schemas.team_members import TeamMemberAdd, TeamMemberUpdate
from app.schemas.user import UserCreate

TEAM_NOT_FOUND_MESSAGE = "Team not found"
USER_NOT_FOUND_MESSAGE = "User not found"
USER_NOT_TEAM_MEMBER_MESSAGE = "User is not a member of this team"


class TeamMemberService:
    """Team roster lifecycle: adding, linking, updating, and removing members."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_team_or_raise(self, team_id: int) -> Team:
        team = await self._db.get(Team, team_id)
        if not team:
            raise RallyNotFoundError(TEAM_NOT_FOUND_MESSAGE)
        return team

    async def get_team_member_or_raise(self, team_id: int, user_id: int) -> User:
        user = await self._db.get(User, user_id)
        if not user:
            raise RallyNotFoundError(USER_NOT_FOUND_MESSAGE)
        if user.team_id != team_id:
            raise RallyValidationError(USER_NOT_TEAM_MEMBER_MESSAGE)
        return user

    async def _has_captain(self, team_id: int, *, excluding_user_id: int | None = None) -> bool:
        stmt = select(User).where(User.team_id == team_id, User.is_captain.is_(True))
        if excluding_user_id is not None:
            stmt = stmt.where(User.id != excluding_user_id)
        return (await self._db.scalars(stmt)).first() is not None

    async def add_member(
        self, team_id: int, member_data: TeamMemberAdd, *, is_privileged: bool
    ) -> User:
        """Add a new member to a team, enforcing the member cap, walk-up
        registration gating, and single-captain rule."""
        await self.get_team_or_raise(team_id)
        settings = await rally_settings.get_or_create(self._db)

        # Staff can only add members when walk-up registration is enabled.
        # Admins and managers are never gated.
        if not is_privileged and not settings.allow_staff_registration:
            raise RallyForbiddenError("Walk-up registration is currently disabled")

        count_stmt = select(func.count(User.id)).where(User.team_id == team_id)
        current_member_count = await self._db.scalar(count_stmt) or 0
        if current_member_count >= settings.max_members_per_team:
            raise RallyValidationError(
                f"Team member limit reached. Maximum {settings.max_members_per_team} "
                "members allowed per team."
            )

        if member_data.is_captain and await self._has_captain(team_id):
            raise RallyValidationError("Team already has a captain. Remove current captain first.")

        user_data = UserCreate(
            name=member_data.name,
            email=member_data.email,
            team_id=team_id,
            is_captain=member_data.is_captain,
        )
        return await crud.user.create(self._db, obj_in=user_data, commit=True)

    async def update_member(
        self, team_id: int, user_id: int, member_data: TeamMemberUpdate
    ) -> User:
        """Update a member's fields, enforcing the single-captain rule."""
        user = await self.get_team_member_or_raise(team_id, user_id)

        if member_data.is_captain is True and await self._has_captain(
            team_id, excluding_user_id=user_id
        ):
            raise RallyValidationError("Team already has a captain. Remove current captain first.")

        user.apply_update(member_data)

        await self._db.commit()
        await self._db.refresh(user)
        return user

    async def remove_member(self, team_id: int, user_id: int) -> None:
        user = await self.get_team_member_or_raise(team_id, user_id)
        user.leave_team()
        await self._db.commit()

    async def list_members(self, team_id: int) -> list[User]:
        await self.get_team_or_raise(team_id)
        stmt = select(User).where(User.team_id == team_id)
        return list((await self._db.scalars(stmt)).all())

    async def link_placeholder_to_authentik_account(
        self,
        *,
        team: Team,
        placeholder: User,
        authentik_sub: str,
        name: str | None,
        email: str | None,
    ) -> User:
        """Move a placeholder member's team slot onto a real NEI (OIDC) account.

        Shared by the admin-driven link endpoint and the team's own self-serve
        link endpoint. Creates a local mirror of the account on first login.
        """
        if placeholder.authentik_sub is not None:
            raise RallyValidationError("This member is already linked to an account")

        target = await crud.user.get_by_authentik_sub(self._db, authentik_sub=authentik_sub)
        if target is None:
            target = await crud.user.create_for_oidc(
                self._db,
                authentik_sub=authentik_sub,
                name=name or placeholder.name,
                email=email,
                scopes=[],
            )
        if target.team_id is not None:
            raise RallyValidationError("Target account is already on a team")

        target.link_to_team(team_id=placeholder.team_id, is_captain=bool(placeholder.is_captain))
        self._db.add(target)
        await self._db.delete(placeholder)
        await self._db.flush()

        await crud.participation.record(
            self._db,
            authentik_sub=authentik_sub,
            event_id=team.event_id or (await crud.rally_event.ensure_current(self._db)).id,
            team=team,
            is_captain=bool(target.is_captain),
            commit=False,
        )
        await self._db.commit()
        await self._db.refresh(target)
        return target
