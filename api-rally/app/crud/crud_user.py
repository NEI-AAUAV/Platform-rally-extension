from typing import Optional
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate

from ._deps import foreign_key_error_regex

_team_foreign_error_regex = foreign_key_error_regex(User.team_id.name)


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    def create(self, db: Session, *, obj_in: UserCreate, user_id: Optional[int] = None) -> User:
        """
        Create a user. If user_id is provided, it will be set before commit.
        This is needed for NEI platform compatibility where user IDs must match auth.sub.
        """
        try:
            obj_in_data = jsonable_encoder(obj_in)
            db_obj = self.model(**obj_in_data)
            # Set ID before commit if provided (for NEI platform compatibility)
            if user_id is not None:
                db_obj.id = user_id  # type: ignore[assignment]  # noqa: A001
            db.add(db_obj)
            db.commit()
            db.refresh(db_obj)
            return db_obj
        except IntegrityError as e:
            db.rollback()

            if e.orig is None:
                raise

            if _team_foreign_error_regex.search(str(e.orig)) is not None:
                raise HTTPException(status_code=404, detail="Team not found")

            raise

    def update(self, db: Session, *, id: int, obj_in: UserUpdate) -> User:
        try:
            return super().update(db, id=id, obj_in=obj_in)
        except IntegrityError as e:
            db.rollback()

            if e.orig is None:
                raise

            if _team_foreign_error_regex.search(str(e.orig)) is not None:
                raise HTTPException(status_code=404, detail="Team not found")

            raise


user = CRUDUser(User)
