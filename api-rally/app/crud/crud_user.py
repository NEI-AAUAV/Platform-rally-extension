from collections.abc import Sequence

from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyNotFoundError
from app.crud._deps import foreign_key_error_regex
from app.crud.base import CRUDBase
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate

_team_foreign_error_regex = foreign_key_error_regex(User.team_id.name)


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    async def create(self, db: AsyncSession, *, obj_in: UserCreate, commit: bool = False) -> User:
        """
        Override default create to keep consistent error handling.
        """
        return await self._create_internal(db, obj_in=obj_in, commit=commit)

    async def get_by_authentik_sub(self, db: AsyncSession, *, authentik_sub: str) -> User | None:
        """Look up a staff/manager/admin user by their OIDC subject."""

        result = await db.scalars(select(User).where(User.authentik_sub == authentik_sub))
        return result.first()

    async def get_by_authentik_subs(
        self, db: AsyncSession, *, authentik_subs: list[str]
    ) -> Sequence[User]:
        """Fetch locally-mirrored users for a set of OIDC subjects."""
        if not authentik_subs:
            return []
        stmt = select(User).where(User.authentik_sub.in_(authentik_subs))
        return list((await db.scalars(stmt)).all())

    async def search_oidc_users(
        self, db: AsyncSession, *, q: str, limit: int = 10
    ) -> Sequence[User]:
        """Search users that have logged in via OIDC (authentik_sub set).

        Matches name or email case-insensitively. Used by admins to find a real
        NEI account to link to a name-only placeholder member.
        """
        term = f"%{q.strip()}%"
        stmt = (
            select(User)
            .where(
                User.authentik_sub.isnot(None),
                or_(User.name.ilike(term), User.email.ilike(term)),
            )
            .order_by(User.name)
            .limit(limit)
        )
        return list((await db.scalars(stmt)).all())

    async def create_for_oidc(
        self,
        db: AsyncSession,
        *,
        authentik_sub: str,
        name: str,
        email: str | None,
        scopes: list[str],
    ) -> User:
        """Create a local user mirroring an authentik identity on first login."""
        db_obj = User(
            authentik_sub=authentik_sub,
            name=name,
            email=email,
            scopes=scopes,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_by_email(self, db: AsyncSession, *, email: str) -> User | None:
        result = await db.scalars(select(User).where(User.email == email))
        return result.first()

    async def get_or_create_mirror(
        self,
        db: AsyncSession,
        *,
        name: str,
        email: str | None,
        scope: str,
    ) -> User:
        """Get the local mirror for an Authentik account, creating or
        updating it as needed so the account does not require a first login
        to be usable (e.g. to assign a rally-staff checkpoint).

        Matched by email rather than ``authentik_sub``: the Authentik
        management API only exposes the account's ``uuid``, which is *not*
        the same value as the JWT ``sub`` claim used to mirror accounts on
        login (Authentik hashes the subject per-provider by default). Using
        ``authentik_sub`` here would create a second row for the same
        person once they actually log in. ``authentik_sub`` is left unset
        and gets backfilled by the login path when it happens.

        ``email`` has no unique constraint, so a bare check-then-insert
        races: two concurrent callers for the same not-yet-mirrored email
        (e.g. two overlapping group-reconciliation requests) can both see
        no existing row and both insert, leaving a duplicate mirror for one
        person. A transaction-scoped advisory lock keyed on the email
        serializes callers for that email without needing a schema change
        or affecting unrelated rows.
        """
        if not email:
            db_obj = User(authentik_sub=None, name=name, email=email, scopes=[scope])
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj

        await db.execute(select(func.pg_advisory_xact_lock(func.hashtext(email))))
        existing = await self.get_by_email(db, email=email)
        if existing is None:
            db_obj = User(authentik_sub=None, name=name, email=email, scopes=[scope])
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj
        if scope not in (existing.scopes or []):
            existing.scopes = [*(existing.scopes or []), scope]
            await db.commit()
            await db.refresh(existing)
        return existing

    async def revoke_scope(self, db: AsyncSession, *, user: User, scope: str) -> User:
        """Remove a scope from a user's locally mirrored scopes list.

        Used to reconcile the mirror when a user is no longer a member of
        the Authentik group that granted the scope, independent of whether
        they log in again (login-time sync alone would leave the mirror
        stale for users who never log back in).
        """
        if scope in (user.scopes or []):
            user.scopes = [s for s in (user.scopes or []) if s != scope]
            db.add(user)
            await db.commit()
            await db.refresh(user)
        return user

    async def _create_internal(
        self,
        db: AsyncSession,
        *,
        obj_in: UserCreate,
        commit: bool = False,
    ) -> User:
        db_obj = self.model(**jsonable_encoder(obj_in))
        try:
            # The potentially failing flush belongs inside a SAVEPOINT.  In
            # commit=False mode the caller owns the surrounding transaction;
            # a bad team_id must not roll that transaction back globally.
            async with db.begin_nested():
                db.add(db_obj)
                await db.flush()
        except IntegrityError as e:
            if e.orig is None:
                raise

            if _team_foreign_error_regex.search(str(e.orig)) is not None:
                raise RallyNotFoundError("Team not found") from e

            raise

        if commit:
            await db.commit()
        else:
            await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def update(
        self, db: AsyncSession, *, id: int, obj_in: UserUpdate, commit: bool = False
    ) -> User:
        try:
            # CRUDBase.update() leaves its final flush *outside* its nested
            # transaction, so an FK violation there poisons the caller's whole
            # transaction.  Keep the mutation and constraint-checking flush in
            # the same SAVEPOINT here instead.
            async with db.begin_nested():
                db_obj = await self.get(db, id=id, for_update=True)
                db_obj = self.update_unlocked(db_obj=db_obj, obj_in=obj_in)
                await db.flush()
        except IntegrityError as e:
            if e.orig is None:
                raise

            if _team_foreign_error_regex.search(str(e.orig)) is not None:
                raise RallyNotFoundError("Team not found") from e

            raise

        if commit:
            await db.commit()
        else:
            await db.flush()
        return db_obj


user = CRUDUser(User)
