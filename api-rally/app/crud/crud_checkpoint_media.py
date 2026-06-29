from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.checkpoint_media import CheckpointMedia, MediaKind
from app.schemas.checkpoint_media import CheckpointMediaCreate, CheckpointMediaUpdate
from app.services.storage import storage_client


class CRUDCheckpointMedia:
    async def get(self, db: AsyncSession, *, id: int) -> Optional[CheckpointMedia]:
        result = await db.execute(select(CheckpointMedia).where(CheckpointMedia.id == id))
        return result.scalars().first()

    async def get_by_checkpoint(self, db: AsyncSession, *, checkpoint_id: int) -> List[CheckpointMedia]:
        result = await db.execute(
            select(CheckpointMedia)
            .where(CheckpointMedia.checkpoint_id == checkpoint_id)
            .order_by(CheckpointMedia.order)
        )
        return list(result.scalars().all())

    async def create(
        self,
        db: AsyncSession,
        *,
        checkpoint_id: int,
        obj_in: CheckpointMediaCreate,
        image_url: Optional[str] = None,
    ) -> CheckpointMedia:
        db_obj = CheckpointMedia(
            checkpoint_id=checkpoint_id,
            kind=obj_in.kind,
            caption=obj_in.caption,
            order=obj_in.order,
            image_url=image_url,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: CheckpointMedia,
        obj_in: CheckpointMediaUpdate,
        image_url: Optional[str] = None,
    ) -> CheckpointMedia:
        if obj_in.caption is not None:
            db_obj.caption = obj_in.caption
        if obj_in.order is not None:
            db_obj.order = obj_in.order
        if image_url is not None:
            if db_obj.image_url:
                storage_client.delete_image(db_obj.image_url)
            db_obj.image_url = image_url
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete(self, db: AsyncSession, *, db_obj: CheckpointMedia) -> None:
        if db_obj.image_url:
            storage_client.delete_image(db_obj.image_url)
        await db.delete(db_obj)
        await db.commit()

    async def reorder(
        self,
        db: AsyncSession,
        *,
        checkpoint_id: int,
        ordered_ids: List[int],
    ) -> List[CheckpointMedia]:
        items = await self.get_by_checkpoint(db, checkpoint_id=checkpoint_id)
        id_to_item = {item.id: item for item in items}
        for position, media_id in enumerate(ordered_ids):
            if media_id in id_to_item:
                id_to_item[media_id].order = position
        await db.commit()
        return await self.get_by_checkpoint(db, checkpoint_id=checkpoint_id)


checkpoint_media = CRUDCheckpointMedia()
