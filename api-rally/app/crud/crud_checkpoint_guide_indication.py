from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyValidationError
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.schemas.checkpoint_guide_indication import (
    CheckpointGuideIndicationCreate,
    CheckpointGuideIndicationUpdate,
)


class CRUDCheckpointGuideIndication:
    async def get(self, db: AsyncSession, *, id: int) -> CheckpointGuideIndication | None:
        result = await db.execute(
            select(CheckpointGuideIndication).where(CheckpointGuideIndication.id == id)
        )
        return result.scalars().first()

    async def get_by_checkpoint(
        self, db: AsyncSession, *, checkpoint_id: int
    ) -> list[CheckpointGuideIndication]:
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
        """Delete an indication, unless a team has already paid to unlock it.

        A plain delete orphaned the ``CheckpointHintReveal`` rows: both
        ``HintService.list_hints`` and ``summary_for_team`` inner-join the
        indication and silently drop a reveal whose row is gone, while the
        points charged for it stay on the team's total. The team paid and lost
        the hint, with nothing anywhere saying so. Editing the text is still
        allowed — that changes what a paid hint says, not whether it exists.
        """
        paid = await db.scalar(
            select(func.count())
            .select_from(CheckpointHintReveal)
            .where(CheckpointHintReveal.indication_id == db_obj.id)
        )
        if paid:
            raise RallyValidationError(
                f"{paid} team(s) already paid to unlock this indication; "
                "edit its text instead of deleting it."
            )
        await db.delete(db_obj)
        await db.commit()


checkpoint_guide_indication = CRUDCheckpointGuideIndication()
