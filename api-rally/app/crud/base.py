from collections.abc import Sequence
from typing import Any, TypeVar

from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyNotFoundError
from app.models.base import Base

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

# Default cap for list queries when the caller passes no explicit limit, so a
# growing table can never return an unbounded result set by accident.
DEFAULT_MAX_LIMIT = 500


class CRUDBase[ModelType: Base, CreateSchemaType: BaseModel, UpdateSchemaType: BaseModel]:
    def __init__(self, model: type[ModelType]):
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
            raise RallyNotFoundError(f"{self.model.__name__} Not Found")
        return obj

    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: int | None = None,
        limit: int | None = None,
        for_update: bool = False,
    ) -> Sequence[ModelType]:
        effective_limit = DEFAULT_MAX_LIMIT if limit is None else limit
        stmt = select(self.model).limit(effective_limit).offset(skip)
        if for_update:
            # Deterministic lock order. Without it Postgres locks rows in
            # whatever order the plan returns, so two concurrent transactions
            # taking the same set could take it in different orders and
            # deadlock. Every other FOR UPDATE scan in the codebase orders by
            # primary key (CRUDTeam.get_multi, crud_versus, ScoringService), so
            # this generic one must too, or the two families of scan deadlock
            # against each other. The LIMIT makes it doubly necessary:
            # unordered, two callers could lock different subsets entirely.
            stmt = stmt.order_by(*self.model.__mapper__.primary_key).with_for_update()
        return (await db.scalars(stmt)).all()

    async def create(
        self, db: AsyncSession, *, obj_in: CreateSchemaType, commit: bool = False
    ) -> ModelType:
        """Create and persist a new row.

        Flushes only by default, so the caller can batch this write with
        others into a single atomic transaction. Pass commit=True for a
        standalone write that should commit immediately.
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

    def update_unlocked(self, *, db_obj: ModelType, obj_in: UpdateSchemaType) -> ModelType:
        update_data = obj_in.model_dump(exclude_unset=True)

        for field in jsonable_encoder(db_obj):
            if field in update_data:
                setattr(db_obj, field, update_data[field])

        return db_obj

    async def update(
        self, db: AsyncSession, *, id: int, obj_in: UpdateSchemaType, commit: bool = False
    ) -> ModelType:
        """Update a row by id.

        Flushes only by default, so the caller can batch this write with
        others into a single atomic transaction. Pass commit=True for a
        standalone write that should commit immediately.
        """
        async with db.begin_nested():
            db_obj = await self.get(db, id=id, for_update=True)
            db_obj = self.update_unlocked(db_obj=db_obj, obj_in=obj_in)
        if commit:
            await db.commit()
        else:
            await db.flush()
        return db_obj

    async def remove(self, db: AsyncSession, *, id: int, commit: bool = False) -> ModelType:
        """Delete a row by id.

        Flushes only by default, so the caller can batch this write with
        others into a single atomic transaction. Pass commit=True for a
        standalone write that should commit immediately.
        """
        db_obj = await self.get(db, id=id)
        await db.delete(db_obj)
        if commit:
            await db.commit()
        else:
            await db.flush()
        return db_obj
