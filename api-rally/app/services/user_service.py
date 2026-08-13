"""Business rules for user/staff/guide checkpoint assignments."""

from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api import authentik_client
from app.core.exceptions import RallyValidationError
from app.models.user import User

AssignmentSchemaT = TypeVar("AssignmentSchemaT", bound=BaseModel)


class UserService:
    """Staff/guide checkpoint-assignment lifecycle, mirrored from Authentik groups."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_checkpoint_assignments(
        self,
        *,
        group: str,
        scope: str,
        assignment_crud: Any,
        schema: type[AssignmentSchemaT],
    ) -> list[AssignmentSchemaT]:
        """Shared list/mirror logic behind /staff-assignments and
        /guide-assignments: mirrors the Authentik group live, then joins each
        mirrored user against their (possibly absent) checkpoint assignment.

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
        member_emails = {member.email for member in group_members if member.email}

        for member in group_members:
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
            if group_members and user.email not in member_emails:
                # No longer in the Authentik group: revoke the stale local
                # scope so the mirror stays truthful even if this user never
                # logs in again.
                await crud.user.revoke_scope(self._db, user=user, scope=scope)
                continue
            users.append(user)

        existing_assignments = await assignment_crud.get_multi_with_checkpoint(self._db)
        assignment_map = {assignment.user_id: assignment for assignment in existing_assignments}

        result = []
        for user in users:
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
        return result

    async def update_checkpoint_assignment(
        self,
        *,
        user_id: int,
        checkpoint_id: int | None,
        assignment_crud: Any,
        schema: type[AssignmentSchemaT],
        error_message: str,
    ) -> AssignmentSchemaT:
        """Shared create/update logic behind the staff and guide
        checkpoint-assignment PUT endpoints."""
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
