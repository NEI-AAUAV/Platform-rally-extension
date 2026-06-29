from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.badge_definition import BadgeDefinition
from app.schemas.badge_definition import BadgeDefinitionCreate, BadgeDefinitionUpdate
from app.services.storage import storage_client


class CRUDBadgeDefinition:
    async def get(self, db: AsyncSession, *, id: int) -> Optional[BadgeDefinition]:
        result = await db.execute(select(BadgeDefinition).where(BadgeDefinition.id == id))
        return result.scalars().first()

    async def get_by_code(self, db: AsyncSession, *, code: str) -> Optional[BadgeDefinition]:
        result = await db.execute(select(BadgeDefinition).where(BadgeDefinition.code == code))
        return result.scalars().first()

    async def get_all(self, db: AsyncSession) -> List[BadgeDefinition]:
        result = await db.execute(select(BadgeDefinition).order_by(BadgeDefinition.id))
        return list(result.scalars().all())

    async def create(self, db: AsyncSession, *, obj_in: BadgeDefinitionCreate) -> BadgeDefinition:
        db_obj = BadgeDefinition(
            code=obj_in.code,
            name=obj_in.name,
            description=obj_in.description,
            is_active=obj_in.is_active,
            is_auto=obj_in.is_auto,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: BadgeDefinition,
        obj_in: BadgeDefinitionUpdate,
        icon_url: Optional[str] = None,
    ) -> BadgeDefinition:
        if obj_in.name is not None:
            db_obj.name = obj_in.name
        if obj_in.description is not None:
            db_obj.description = obj_in.description
        if obj_in.is_active is not None:
            db_obj.is_active = obj_in.is_active
        if icon_url is not None:
            if db_obj.icon_url:
                storage_client.delete_image(db_obj.icon_url)
            db_obj.icon_url = icon_url
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete(self, db: AsyncSession, *, db_obj: BadgeDefinition) -> None:
        if db_obj.icon_url:
            storage_client.delete_image(db_obj.icon_url)
        await db.delete(db_obj)
        await db.commit()


badge_definition = CRUDBadgeDefinition()
