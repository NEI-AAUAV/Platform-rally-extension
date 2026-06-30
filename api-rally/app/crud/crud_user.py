from typing import Optional, Sequence
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, select


from app.core.exceptions import RallyNotFoundError
from app.crud.base import CRUDBase
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate

from ._deps import foreign_key_error_regex

_team_foreign_error_regex = foreign_key_error_regex(User.team_id.name)


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    async def create(self, db: AsyncSession, *, obj_in: UserCreate) -> User:
        """
        Override default create to keep consistent error handling.
        """
        return await self._create_internal(db, obj_in=obj_in)

    async def get_by_authentik_sub(
        self, db: AsyncSession, *, authentik_sub: str
    ) -> Optional[User]:
        """Look up a staff/manager/admin user by their OIDC subject."""

        result = await db.scalars(
            select(User).where(User.authentik_sub == authentik_sub)
        )
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
        email: Optional[str],
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

    async def get_or_create_mirror(
        self,
        db: AsyncSession,
        *,
        authentik_sub: str,
        name: str,
        email: Optional[str],
        scope: str,
    ) -> User:
        """Get the local mirror for an Authentik account, creating or
        updating it as needed so the account does not require a first login
        to be usable (e.g. to assign a rally-staff checkpoint).
        """
        existing = await self.get_by_authentik_sub(db, authentik_sub=authentik_sub)
        if existing is None:
            return await self.create_for_oidc(
                db, authentik_sub=authentik_sub, name=name, email=email, scopes=[scope]
            )
        if scope not in (existing.scopes or []):
            existing.scopes = [*(existing.scopes or []), scope]
            await db.commit()
            await db.refresh(existing)
        return existing

    async def _create_internal(
        self,
        db: AsyncSession,
        *,
        obj_in: UserCreate,
    ) -> User:
        try:
            obj_in_data = jsonable_encoder(obj_in)
            db_obj = self.model(**obj_in_data)
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj
        except IntegrityError as e:
            await db.rollback()

            if e.orig is None:
                raise

            if _team_foreign_error_regex.search(str(e.orig)) is not None:
                raise RallyNotFoundError("Team not found")

            raise

    async def update(self, db: AsyncSession, *, id: int, obj_in: UserUpdate) -> User:
        try:
            return await super().update(db, id=id, obj_in=obj_in)
        except IntegrityError as e:
            await db.rollback()

            if e.orig is None:
                raise

            if _team_foreign_error_regex.search(str(e.orig)) is not None:
                raise RallyNotFoundError("Team not found")

            raise


user = CRUDUser(User)
