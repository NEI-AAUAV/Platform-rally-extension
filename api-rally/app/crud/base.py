from typing import Any, Generic, Optional, Sequence, Type, TypeVar
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exception import NotFoundException
from app.models.base import Base

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

# Default cap for list queries when the caller passes no explicit limit, so a
# growing table can never return an unbounded result set by accident.
DEFAULT_MAX_LIMIT = 500


class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]):
        """
        CRUD object with default methods to Create, Read, Update, Delete (CRUD).
        **Parameters**
        * `model`: A SQLAlchemy model class
        * `schema`: A Pydantic model (schema) class
        """
        self.model = model

    async def get(self, db: AsyncSession, *, id: Any, for_update: bool = False) -> ModelType:
        obj = await db.get(self.model, id, with_for_update=for_update)
        if obj is None:
            raise NotFoundException(detail=f"{self.model.__name__} Not Found")
        return obj

    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: Optional[int] = None,
        limit: Optional[int] = None,
        for_update: bool = False,
    ) -> Sequence[ModelType]:
        effective_limit = DEFAULT_MAX_LIMIT if limit is None else limit
        stmt = select(self.model).limit(effective_limit).offset(skip)
        if for_update:
            stmt = stmt.with_for_update()
        return (await db.scalars(stmt)).all()

    async def create(
        self, db: AsyncSession, *, obj_in: CreateSchemaType, commit: bool = True
    ) -> ModelType:
        """Create and persist a new row.

        Commits by default. Pass commit=False to only flush, so the caller
        can batch this write with others into a single atomic transaction.
        """
        obj_in_data = jsonable_encoder(obj_in)
        db_obj = self.model(**obj_in_data)
        db.add(db_obj)
        if commit:
            await db.commit()
        else:
            await db.flush()
        await db.refresh(db_obj)
        return db_obj

    def update_unlocked(
        self, *, db_obj: ModelType, obj_in: UpdateSchemaType
    ) -> ModelType:
        update_data = obj_in.model_dump(exclude_unset=True)

        for field in jsonable_encoder(db_obj):
            if field in update_data:
                setattr(db_obj, field, update_data[field])

        return db_obj

    async def update(
        self, db: AsyncSession, *, id: int, obj_in: UpdateSchemaType, commit: bool = True
    ) -> ModelType:
        """Update a row by id.

        Commits by default. Pass commit=False to only flush, so the caller
        can batch this write with others into a single atomic transaction.
        """
        async with db.begin_nested():
            db_obj = await self.get(db, id=id, for_update=True)
            db_obj = self.update_unlocked(db_obj=db_obj, obj_in=obj_in)
        if commit:
            await db.commit()
        else:
            await db.flush()
        return db_obj

    async def remove(self, db: AsyncSession, *, id: int, commit: bool = True) -> ModelType:
        """Delete a row by id.

        Commits by default. Pass commit=False to only flush, so the caller
        can batch this write with others into a single atomic transaction.
        """
        db_obj = await self.get(db, id=id)
        await db.delete(db_obj)
        if commit:
            await db.commit()
        else:
            await db.flush()
        return db_obj
