"""Business rules for team roster management: member limits, captain
uniqueness, and linking placeholder members to real NEI (OIDC) accounts.
Moved out of app.api.api_v1.team_members, which used to hold this logic
inline in the router handlers.
"""

import hmac

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from app import crud
from app.api.auth import AuthData
from app.api.authentik_client import AuthentikUser
from app.core.email_utils import normalize_email
from app.core.exceptions import RallyForbiddenError, RallyNotFoundError, RallyValidationError
from app.crud.crud_rally_settings import rally_settings
from app.models.team import Team
from app.models.user import User
from app.schemas.team_members import TeamMemberAdd, TeamMemberUpdate
from app.schemas.user import UserCreate

TEAM_NOT_FOUND_MESSAGE = "Team not found"
USER_NOT_FOUND_MESSAGE = "User not found"
USER_NOT_TEAM_MEMBER_MESSAGE = "User is not a member of this team"
INVALID_ACCESS_CODE_MESSAGE = "Invalid team access code"
ALREADY_LINKED_MESSAGE = "This member is already linked to an account"
LINK_CONFLICT_MESSAGE = "Este membro acabou de ser alterado por outro pedido. Atualiza a página."
EMAIL_IN_USE_MESSAGE = (
    "Já existe outra conta NEI com este email. Remove o email do membro ou contacta um admin."
)


class TeamMemberService:
    """Team roster lifecycle: adding, linking, updating, and removing members."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_team_or_raise(self, team_id: int) -> Team:
        team = await self._db.get(Team, team_id)
        if not team:
            raise RallyNotFoundError(TEAM_NOT_FOUND_MESSAGE)
        return team

    async def find_team(self, team_id: int) -> Team | None:
        return await self._db.get(Team, team_id)

    def assert_team_access_code(self, team: Team, access_code: str) -> None:
        """Verify the caller holds ``team``'s access code.

        Used by self-serve flows where the bearer token identifies the person
        but not the team, so nothing else binds the caller to this roster.
        """
        if not hmac.compare_digest((team.access_code or "").strip(), access_code.strip()):
            raise RallyForbiddenError(INVALID_ACCESS_CODE_MESSAGE)

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

    async def _lock_placeholder(self, team_id: int, user_id: int) -> User:
        """Load the placeholder row ``FOR UPDATE`` so concurrent links of the same
        member serialize: the loser then sees it linked (or gone) instead of
        failing with a 500 on a stale delete or a duplicate participation."""
        stmt = (
            select(User)
            .where(User.id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        placeholder = await self._db.scalar(stmt)
        if placeholder is None:
            raise RallyNotFoundError(USER_NOT_FOUND_MESSAGE)
        if placeholder.team_id != team_id:
            raise RallyValidationError(USER_NOT_TEAM_MEMBER_MESSAGE)
        if placeholder.is_linked:
            raise RallyValidationError(ALREADY_LINKED_MESSAGE)
        return placeholder

    async def _get_by_authentik_uuid(self, authentik_uuid: str) -> User | None:
        stmt = select(User).where(User.authentik_uuid == authentik_uuid)
        return (await self._db.scalars(stmt)).first()

    async def link_with_authentik_account(
        self, *, team: Team, user_id: int, account: AuthentikUser
    ) -> User:
        """Admin link: bind a placeholder's team slot to an Authentik account.

        ``account.authentik_sub`` is the Authentik *uuid*, which is the OIDC
        subject only in "user UUID" subject mode. It is therefore stored in
        ``authentik_uuid``; ``authentik_sub`` is only ever written by a login.
        The person's existing row is found by uuid, then by uuid-as-subject
        (UUID mode), then by email — ``user.email`` is unique, so creating a new
        row for an address that already exists used to fail with a 500.
        """
        placeholder = await self._lock_placeholder(team.id, user_id)
        email = normalize_email(account.email)

        target = await self._get_by_authentik_uuid(account.authentik_sub)
        if target is None:
            target = await crud.user.get_by_authentik_sub(
                self._db, authentik_sub=account.authentik_sub
            )
        if target is None and email:
            target = await crud.user.get_by_email(self._db, email=email)
        if target is not None and target.authentik_uuid not in (None, account.authentik_sub):
            raise RallyValidationError(EMAIL_IN_USE_MESSAGE)

        if target is None:
            target = User(
                authentik_uuid=account.authentik_sub,
                name=account.name or placeholder.name,
                email=email,
                scopes=[],
            )
        to_delete = self._move_slot(placeholder, target)
        target.authentik_uuid = account.authentik_sub
        return await self._finish_link(team, target, to_delete)

    async def link_self(
        self, *, team: Team, user_id: int, auth: AuthData, adopt_by_email: bool
    ) -> User:
        """Self-serve link: bind a placeholder to the caller's own OIDC account.

        A row sharing the caller's email is adopted only under the same rule as
        first login (``adopt_by_email``: verified email or trusted IdP) and only
        while no other subject owns it.
        """
        placeholder = await self._lock_placeholder(team.id, user_id)
        email = normalize_email(auth.email)

        target = await crud.user.get_by_authentik_sub(self._db, authentik_sub=auth.oidc_sub)
        if target is None and email:
            by_email = await crud.user.get_by_email(self._db, email=email)
            if by_email is not None:
                if by_email.authentik_sub is not None or not adopt_by_email:
                    raise RallyValidationError(EMAIL_IN_USE_MESSAGE)
                target = by_email
        if target is None:
            target = await crud.user.create_for_oidc(
                self._db,
                authentik_sub=auth.oidc_sub,
                name=auth.name or placeholder.name,
                email=email,
                scopes=auth.scopes,
                commit=False,
            )

        to_delete = self._move_slot(placeholder, target)
        target.authentik_sub = auth.oidc_sub
        return await self._finish_link(team, target, to_delete)

    def _move_slot(self, placeholder: User, target: User) -> User | None:
        """Give ``target`` the placeholder's team slot and captaincy.

        Checked before ``target`` is touched, so a rejected link leaves no
        half-applied change in the session. When the placeholder *is* the
        person's row (added with their email) it is claimed in place.
        Returns the placeholder to delete, if any.
        """
        if target is placeholder:
            return None
        if target.team_id is not None:
            raise RallyValidationError("Target account is already on a team")
        target.link_to_team(team_id=placeholder.team_id, is_captain=bool(placeholder.is_captain))
        return placeholder

    async def _finish_link(self, team: Team, target: User, to_delete: User | None) -> User:
        """Persist the link as one transaction and record participation.

        Participation is keyed on the OIDC subject; a row linked by uuid only
        gets it when the person first opens their profile
        (``ProfileService.record_current_participation_if_on_team``).
        """
        self._db.add(target)
        try:
            if to_delete is not None:
                await self._db.delete(to_delete)
            await self._db.flush()
            if target.authentik_sub is not None:
                await crud.participation.record(
                    self._db,
                    authentik_sub=target.authentik_sub,
                    event_id=team.event_id or (await crud.rally_event.ensure_current(self._db)).id,
                    team=team,
                    is_captain=bool(target.is_captain),
                    commit=False,
                )
            await self._db.commit()
        except (IntegrityError, StaleDataError):
            await self._db.rollback()
            raise RallyValidationError(LINK_CONFLICT_MESSAGE) from None
        await self._db.refresh(target)
        return target
