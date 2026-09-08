"""Business rules for user/staff checkpoint assignments and user/guide team
assignments."""

from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api import authentik_client
from app.api.auth import ScopeEnum
from app.core.email_utils import normalize_email
from app.core.exceptions import RallyValidationError
from app.crud.crud_rally_guide_assignment import rally_guide_assignment
from app.crud.crud_rally_staff_assignment import rally_staff_assignment
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.models.user import User
from app.schemas.pagination import Page

AssignmentSchemaT = TypeVar("AssignmentSchemaT", bound=BaseModel)


class UserService:
    """Staff/guide assignment lifecycle, mirrored from Authentik groups."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _mirrored_group_users(self, *, group: str, scope: str) -> list[User]:
        """Mirror an Authentik group live, then return the locally mirrored
        users who currently hold ``scope``.

        Reconciles against live group membership rather than trusting the
        locally mirrored ``scopes`` column: that column only updates when the
        user themselves logs in (see ``_sync_scopes``), so a user removed
        from the Authentik group keeps showing up here indefinitely if they
        never log back in. Adding and revoking the scope here keeps the list
        accurate regardless of login activity.

        Revocation only runs when the Authentik call actually returned
        members. ``list_group_members`` degrades to ``[]`` both when a group
        is genuinely empty and when the call fails or OIDC is unconfigured
        (see ``authentik_client``); treating those the same as "everyone was
        removed" would mass-revoke every mirrored user on a transient API
        error, so an empty result is left untouched instead.
        """
        group_members = await authentik_client.list_group_members(group)
        # Normalized on both sides: mirrored rows store the lowercased address,
        # while Authentik returns whatever case the account was created with.
        # Comparing the two raw would read a current member as "no longer in the
        # group" and revoke a scope that is still granted.
        member_emails = {
            normalized
            for member in group_members
            if (normalized := normalize_email(member.email)) is not None
        }

        for member in group_members:
            # Returns None for a member without an email: that row could never
            # be matched again, so it is skipped rather than re-inserted on
            # every request (see get_or_create_mirror).
            await crud.user.get_or_create_mirror(
                self._db,
                name=member.name,
                email=member.email,
                scope=scope,
            )

        stmt = select(User).where(User.scopes.contains([scope]))
        scoped_users = (await self._db.scalars(stmt)).all()

        users = []
        for user in scoped_users:
            if group_members and normalize_email(user.email) not in member_emails:
                # No longer in the Authentik group: revoke the stale local
                # scope so the mirror stays truthful even if this user never
                # logs in again. Dropping the scope is what removes them from
                # the admin listing, which selects on scope.
                await crud.user.revoke_scope(self._db, user=user, scope=scope)
                await self._clear_assignments_for_revoked_scope(user=user, scope=scope)
                continue
            users.append(user)
        return users

    async def _clear_assignments_for_revoked_scope(self, *, user: User, scope: str) -> None:
        """Drop the current event's post/team assignment for a revoked scope.

        Revoking the scope alone already removes the person from the admin
        listing (it selects on scope), but the assignment row survives, and
        ``rally_staff_assignment.user_id`` is not a foreign key — so nothing
        else cleans it up. Left behind it silently re-attaches the old post if
        the person is added back to the group, and keeps the checkpoint looking
        staffed by someone who no longer has access.

        Only the current event is touched: assignments from finished editions
        are that edition's record, not live access.
        """
        assignment: RallyStaffAssignment | RallyGuideAssignment | None
        if scope == ScopeEnum.RALLY_STAFF.value:
            assignment = await rally_staff_assignment.get_by_user_id(self._db, user.id)
            # The legacy cached column reads as an access grant in older code
            # paths; clear it alongside the row it mirrors.
            user.staff_checkpoint_id = None
            self._db.add(user)
        elif scope == ScopeEnum.RALLY_GUIDE.value:
            assignment = await rally_guide_assignment.get_by_user_id(self._db, user.id)
        else:
            return

        if assignment is not None:
            await self._db.delete(assignment)
        await self._db.commit()

    async def list_checkpoint_assignments(
        self,
        *,
        group: str,
        scope: str,
        assignment_crud: Any,
        schema: type[AssignmentSchemaT],
        q: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Page[AssignmentSchemaT]:
        """List/mirror logic behind /staff-assignments: joins each mirrored
        rally-staff user against their (possibly absent) checkpoint
        assignment — staff are fixed to one post for the whole event.

        The candidate set is every user who currently holds ``scope`` (an
        Authentik-group-derived role, not tied to any one event — see
        ``_mirrored_group_users``), which is unbounded over the life of a
        deployment. Paginated, and optionally narrowed with ``q`` (matches
        name or email, case-insensitively) so an admin — or an automated
        test — can jump straight to one person instead of paging through
        everyone."""
        users = await self._mirrored_group_users(group=group, scope=scope)
        if q:
            term = q.strip().lower()
            users = [
                u
                for u in users
                if term in (u.name or "").lower() or term in (u.email or "").lower()
            ]
        users.sort(key=lambda u: (u.name or "", u.email or ""))

        existing_assignments = await assignment_crud.get_multi_with_checkpoint(self._db)
        assignment_map = {assignment.user_id: assignment for assignment in existing_assignments}

        total = len(users)
        start = (page - 1) * page_size
        page_users = users[start : start + page_size]

        result = []
        for user in page_users:
            assignment = assignment_map.get(user.id)
            if assignment:
                result.append(
                    schema(
                        id=assignment.id,
                        user_id=user.id,
                        user_name=user.name,
                        user_email=user.email,
                        checkpoint_id=assignment.checkpoint_id,
                        checkpoint_name=assignment.checkpoint.name
                        if assignment.checkpoint
                        else None,
                        checkpoint_description=assignment.checkpoint.description
                        if assignment.checkpoint
                        else None,
                    )
                )
            else:
                result.append(
                    schema(
                        id=0,  # Temporary ID for unassigned users
                        user_id=user.id,
                        user_name=user.name,
                        user_email=user.email,
                        checkpoint_id=None,
                        checkpoint_name=None,
                        checkpoint_description=None,
                    )
                )
        return Page(items=result, total=total, page=page, page_size=page_size)

    async def update_checkpoint_assignment(
        self,
        *,
        user_id: int,
        checkpoint_id: int | None,
        assignment_crud: Any,
        schema: type[AssignmentSchemaT],
        error_message: str,
    ) -> AssignmentSchemaT:
        """Create/update logic behind the staff checkpoint-assignment PUT
        endpoint."""
        try:
            updated_assignment = await assignment_crud.create_or_update(
                db=self._db, user_id=user_id, checkpoint_id=checkpoint_id
            )

            if updated_assignment:
                return schema(
                    id=updated_assignment.id,
                    user_id=updated_assignment.user_id,
                    checkpoint_id=updated_assignment.checkpoint_id,
                    checkpoint_name=updated_assignment.checkpoint.name
                    if updated_assignment.checkpoint
                    else None,
                    checkpoint_description=updated_assignment.checkpoint.description
                    if updated_assignment.checkpoint
                    else None,
                )
            return schema(
                id=0,
                user_id=user_id,
                checkpoint_id=None,
                checkpoint_name=None,
                checkpoint_description=None,
            )
        except SQLAlchemyError as e:
            raise RallyValidationError(f"{error_message}: {e!s}") from e

    async def list_guide_team_assignments(
        self,
        *,
        group: str,
        scope: str,
        assignment_crud: Any,
        schema: type[AssignmentSchemaT],
        q: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Page[AssignmentSchemaT]:
        """List/mirror logic behind /guide-assignments: joins each mirrored
        rally-guide user against their (possibly absent) team assignment — a
        guide accompanies one team through the whole route rather than being
        fixed to a post.

        See ``list_checkpoint_assignments`` for why this is paginated and
        searchable rather than returning everyone at once — same unbounded
        candidate set, same fix."""
        users = await self._mirrored_group_users(group=group, scope=scope)
        if q:
            term = q.strip().lower()
            users = [
                u
                for u in users
                if term in (u.name or "").lower() or term in (u.email or "").lower()
            ]
        users.sort(key=lambda u: (u.name or "", u.email or ""))

        existing_assignments = await assignment_crud.get_multi_with_team(self._db)
        assignment_map = {assignment.user_id: assignment for assignment in existing_assignments}

        total = len(users)
        start = (page - 1) * page_size
        page_users = users[start : start + page_size]

        result = []
        for user in page_users:
            assignment = assignment_map.get(user.id)
            if assignment:
                result.append(
                    schema(
                        id=assignment.id,
                        user_id=user.id,
                        user_name=user.name,
                        user_email=user.email,
                        team_id=assignment.team_id,
                        team_name=assignment.team.name if assignment.team else None,
                    )
                )
            else:
                result.append(
                    schema(
                        id=0,  # Temporary ID for unassigned users
                        user_id=user.id,
                        user_name=user.name,
                        user_email=user.email,
                        team_id=None,
                        team_name=None,
                    )
                )
        return Page(items=result, total=total, page=page, page_size=page_size)

    async def update_guide_team_assignment(
        self,
        *,
        user_id: int,
        team_id: int | None,
        assignment_crud: Any,
        schema: type[AssignmentSchemaT],
        error_message: str,
    ) -> AssignmentSchemaT:
        """Create/update logic behind the guide team-assignment PUT
        endpoint."""
        try:
            updated_assignment = await assignment_crud.create_or_update(
                db=self._db, user_id=user_id, team_id=team_id
            )

            if updated_assignment:
                return schema(
                    id=updated_assignment.id,
                    user_id=updated_assignment.user_id,
                    team_id=updated_assignment.team_id,
                    team_name=updated_assignment.team.name if updated_assignment.team else None,
                )
            return schema(
                id=0,
                user_id=user_id,
                team_id=None,
                team_name=None,
            )
        except SQLAlchemyError as e:
            raise RallyValidationError(f"{error_message}: {e!s}") from e
