"""CRUD for Web Push subscriptions."""

from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.push_subscription import PushSubscription
from app.schemas.push_subscription import PushSubscriptionCreate


class CRUDPushSubscription(
    CRUDBase[PushSubscription, PushSubscriptionCreate, PushSubscriptionCreate]
):
    async def get_by_endpoint(self, db: AsyncSession, *, endpoint: str) -> PushSubscription | None:
        stmt = select(self.model).where(self.model.endpoint == endpoint)
        result: PushSubscription | None = await db.scalar(stmt)
        return result

    async def get_by_user(self, db: AsyncSession, *, user_id: int) -> Sequence[PushSubscription]:
        stmt = select(self.model).where(self.model.user_id == user_id)
        return (await db.scalars(stmt)).all()

    async def upsert(
        self, db: AsyncSession, *, user_id: int, obj_in: PushSubscriptionCreate
    ) -> PushSubscription:
        """Re-subscribing with the same endpoint (token refresh, re-grant)
        replaces the stored keys rather than duplicating the row."""
        existing = await self.get_by_endpoint(db, endpoint=obj_in.endpoint)
        if existing is not None:
            existing.user_id = user_id
            existing.p256dh = obj_in.keys.p256dh
            existing.auth = obj_in.keys.auth
            db.add(existing)
            await db.commit()
            await db.refresh(existing)
            return existing

        db_obj = self.model(
            user_id=user_id,
            endpoint=obj_in.endpoint,
            p256dh=obj_in.keys.p256dh,
            auth=obj_in.keys.auth,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def remove_by_endpoint(self, db: AsyncSession, *, endpoint: str) -> None:
        await db.execute(delete(self.model).where(self.model.endpoint == endpoint))
        await db.commit()


push_subscription = CRUDPushSubscription(PushSubscription)
