"""Web Push subscription management.

Subscribe/unsubscribe are user-scoped (a device belongs to a logged-in
person, not a team) so a push can be addressed to "this person", matching
how badges/notifications are earned per participant.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.abac_deps import get_staff_with_checkpoint_access
from app.api.deps import get_admin, get_current_user
from app.core.config import settings
from app.schemas.push_subscription import (
    PushBroadcastRequest,
    PushBroadcastResult,
    PushCheckpointAnnouncementRequest,
    PushSubscriptionCreate,
    PushSubscriptionRead,
    PushSubscriptionUnsubscribe,
    VapidPublicKey,
)
from app.schemas.user import DetailedUser
from app.services.deps import get_push_service
from app.services.push_service import PushService


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
        self.router.add_api_route(
            "/push/broadcast",
            self.broadcast,
            methods=["POST"],
            name="push_broadcast",
            dependencies=[Depends(get_admin)],
            responses={503: {"description": "Push notifications are not configured"}},
        )
        self.router.add_api_route(
            "/push/checkpoint-announcement",
            self.checkpoint_announcement,
            methods=["POST"],
            name="push_checkpoint_announcement",
            responses={
                403: {"description": "Staff user has no checkpoint assignment"},
                503: {"description": "Push notifications are not configured"},
            },
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
        current_user: Annotated[DetailedUser, Depends(get_current_user)],
        service: Annotated[PushService, Depends(get_push_service)],
    ) -> PushSubscriptionRead:
        return await service.subscribe(user_id=current_user.id, payload=payload)

    async def unsubscribe(
        self,
        payload: PushSubscriptionUnsubscribe,
        *,
        current_user: Annotated[DetailedUser, Depends(get_current_user)],
        service: Annotated[PushService, Depends(get_push_service)],
    ) -> None:
        await service.unsubscribe(user_id=current_user.id, endpoint=payload.endpoint)

    async def broadcast(
        self,
        payload: PushBroadcastRequest,
        *,
        service: Annotated[PushService, Depends(get_push_service)],
    ) -> PushBroadcastResult:
        """Send one notification to every subscribed device — an admin
        announcement to all teams at once, not addressed to one participant."""
        sent = await service.broadcast(title=payload.title, body=payload.body, url=payload.url)
        return PushBroadcastResult(sent=sent)

    async def checkpoint_announcement(
        self,
        payload: PushCheckpointAnnouncementRequest,
        *,
        curr_user: Annotated[DetailedUser, Depends(get_staff_with_checkpoint_access)],
        service: Annotated[PushService, Depends(get_push_service)],
    ) -> PushBroadcastResult:
        """Let staff announce something about their own post — no admin in
        the loop. Reaches every team like an admin broadcast does (the whole
        rally needs to know a post is delayed or closed, not just teams
        already there); the post's own name is stamped onto the title
        server-side so a staffer can't post as if they were a different
        checkpoint or as a generic admin message.
        """
        if curr_user.staff_checkpoint_id is None:
            # get_staff_with_checkpoint_access only enforces this for the
            # rally-staff scope — an admin or manager calling this route
            # without ever having a checkpoint assigned would otherwise hit
            # crud.checkpoint.get(None) and 404 confusingly.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No checkpoint assignment to announce for",
            )
        sent = await service.announce_from_checkpoint(
            checkpoint_id=curr_user.staff_checkpoint_id, body=payload.body, url=payload.url
        )
        return PushBroadcastResult(sent=sent)


router = PushController().router
