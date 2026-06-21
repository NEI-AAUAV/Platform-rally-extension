from typing import Optional
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

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

    async def create_with_id(self, db: AsyncSession, *, obj_in: UserCreate, user_id: int) -> User:
        """
        Create a user forcing a specific primary key (for NEI auth compatibility).
        """
        return await self._create_internal(db, obj_in=obj_in, user_id=user_id)

    async def _create_internal(
        self,
        db: AsyncSession,
        *,
        obj_in: UserCreate,
        user_id: Optional[int] = None,
    ) -> User:
        try:
            obj_in_data = jsonable_encoder(obj_in)
            db_obj = self.model(**obj_in_data)
            if user_id is not None:
                db_obj.id = user_id  # noqa: A001
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj
        except IntegrityError as e:
            await db.rollback()

            if e.orig is None:
                raise

            if _team_foreign_error_regex.search(str(e.orig)) is not None:
                raise HTTPException(status_code=404, detail="Team not found")

            raise

    async def update(self, db: AsyncSession, *, id: int, obj_in: UserUpdate) -> User:
        try:
            return await super().update(db, id=id, obj_in=obj_in)
        except IntegrityError as e:
            await db.rollback()

            if e.orig is None:
                raise

            if _team_foreign_error_regex.search(str(e.orig)) is not None:
                raise HTTPException(status_code=404, detail="Team not found")

            raise


user = CRUDUser(User)
