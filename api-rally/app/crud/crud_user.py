from typing import Optional
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


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
