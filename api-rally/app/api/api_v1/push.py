"""Web Push subscription management.

Subscribe/unsubscribe are user-scoped (a device belongs to a logged-in
person, not a team) so a push can be addressed to "this person", matching
how badges/notifications are earned per participant.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.schemas.push_subscription import (
    PushSubscriptionCreate,
    PushSubscriptionRead,
    PushSubscriptionUnsubscribe,
    VapidPublicKey,
)
from app.schemas.user import DetailedUser


class PushController:
    """REST controller for Web Push subscription lifecycle."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/push/vapid-public-key",
            self.get_vapid_public_key,
            methods=["GET"],
            name="get_vapid_public_key",
        )
        self.router.add_api_route(
            "/push/subscribe",
            self.subscribe,
            methods=["POST"],
            name="push_subscribe",
        )
        self.router.add_api_route(
            "/push/unsubscribe",
            self.unsubscribe,
            methods=["POST"],
            name="push_unsubscribe",
        )

    def get_vapid_public_key(self) -> VapidPublicKey:
        """The public key the frontend passes to `PushManager.subscribe`.

        None when VAPID isn't configured — the frontend must not prompt for
        notification permission in that case (nothing would ever be sent).
        """
        return VapidPublicKey(public_key=settings.VAPID_PUBLIC_KEY)

    async def subscribe(
        self,
        payload: PushSubscriptionCreate,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        current_user: Annotated[DetailedUser, Depends(get_current_user)],
    ) -> PushSubscriptionRead:
        if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Push notifications are not configured",
            )
        subscription = await crud.push_subscription.upsert(
            db, user_id=current_user.id, obj_in=payload
        )
        return PushSubscriptionRead.model_validate(subscription)

    async def unsubscribe(
        self,
        payload: PushSubscriptionUnsubscribe,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        current_user: Annotated[DetailedUser, Depends(get_current_user)],
    ) -> None:
        existing = await crud.push_subscription.get_by_endpoint(db, endpoint=payload.endpoint)
        if existing is not None and existing.user_id == current_user.id:
            await crud.push_subscription.remove_by_endpoint(db, endpoint=payload.endpoint)


router = PushController().router
