"""Web Push subscription management.

Subscribe/unsubscribe accept either session the app has: a logged-in
user (staff/admin, OIDC) or a team (team token). Teams play from the team
session, so without it their phones could never receive the rally-wide
announcements the admin and staff send.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.abac_deps import get_staff_with_checkpoint_access
from app.api.deps import get_admin, get_current_team_optional, get_current_user_optional
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
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.deps import get_push_service
from app.services.push_service import PushOwner, PushService


def get_push_owner(
    user: Annotated[DetailedUser | None, Depends(get_current_user_optional)],
    team: Annotated[TeamTokenData | None, Depends(get_current_team_optional)],
) -> PushOwner:
    """The session a device subscribes under. A request carries one bearer
    token, so at most one of these resolves; the user wins if both ever do,
    matching the frontend, which sends the staff token first."""
    if user is not None:
        return PushOwner(user_id=user.id)
    if team is not None:
        return PushOwner(team_id=team.team_id)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


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
        owner: Annotated[PushOwner, Depends(get_push_owner)],
        service: Annotated[PushService, Depends(get_push_service)],
    ) -> PushSubscriptionRead:
        return await service.subscribe(owner=owner, payload=payload)

    async def unsubscribe(
        self,
        payload: PushSubscriptionUnsubscribe,
        *,
        owner: Annotated[PushOwner, Depends(get_push_owner)],
        service: Annotated[PushService, Depends(get_push_service)],
    ) -> None:
        await service.unsubscribe(owner=owner, endpoint=payload.endpoint)

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
