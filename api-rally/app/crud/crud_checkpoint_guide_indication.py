from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.schemas.checkpoint_guide_indication import (
    CheckpointGuideIndicationCreate,
    CheckpointGuideIndicationUpdate,
)


class CRUDCheckpointGuideIndication:
    async def get(self, db: AsyncSession, *, id: int) -> Optional[CheckpointGuideIndication]:
        result = await db.execute(
            select(CheckpointGuideIndication).where(CheckpointGuideIndication.id == id)
        )
        return result.scalars().first()

    async def get_by_checkpoint(
        self, db: AsyncSession, *, checkpoint_id: int
    ) -> List[CheckpointGuideIndication]:
        result = await db.execute(
            select(CheckpointGuideIndication)
            .where(CheckpointGuideIndication.checkpoint_id == checkpoint_id)
            .order_by(CheckpointGuideIndication.order)
        )
        return list(result.scalars().all())

    async def create(
        self,
        db: AsyncSession,
        *,
        checkpoint_id: int,
        obj_in: CheckpointGuideIndicationCreate,
    ) -> CheckpointGuideIndication:
        db_obj = CheckpointGuideIndication(
            checkpoint_id=checkpoint_id,
            hint=obj_in.hint,
            question=obj_in.question,
            expected_answer=obj_in.expected_answer,
            order=obj_in.order,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: CheckpointGuideIndication,
        obj_in: CheckpointGuideIndicationUpdate,
    ) -> CheckpointGuideIndication:
        if obj_in.hint is not None:
            db_obj.hint = obj_in.hint
        if obj_in.question is not None:
            db_obj.question = obj_in.question
        if obj_in.expected_answer is not None:
            db_obj.expected_answer = obj_in.expected_answer
        if obj_in.order is not None:
            db_obj.order = obj_in.order
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete(self, db: AsyncSession, *, db_obj: CheckpointGuideIndication) -> None:
        await db.delete(db_obj)
        await db.commit()


checkpoint_guide_indication = CRUDCheckpointGuideIndication()
