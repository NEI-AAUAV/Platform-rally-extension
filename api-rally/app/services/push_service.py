"""Web Push delivery: sends a notification payload to every subscription a
user holds. pywebpush is sync (built on `requests`), so calls run in a
worker thread via `run_in_threadpool` to avoid blocking the event loop.

Fire-and-forget by design, mirroring EVENTS_FAIL_SILENTLY: a push failure
(dead endpoint, missing VAPID config, network error) is logged and never
propagated to the caller — a lost notification must not fail the request
that triggered it (e.g. a badge award).

``PushService`` wraps the module-level delivery functions with the
constructor-injected CRUD access and VAPID/subscription-ownership rules the
controller used to hold inline.
"""

import json
from collections.abc import Sequence

from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool
from loguru import logger
from pywebpush import WebPushException, webpush
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.core.config import settings
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_push_subscription import CRUDPushSubscription
from app.crud.crud_rally_settings import rally_settings
from app.models.push_subscription import PushSubscription
from app.schemas.push_subscription import PushSubscriptionCreate, PushSubscriptionRead

VAPID_NOT_CONFIGURED = "Push notifications are not configured"

# Endpoint gone/expired — the browser will never accept another push here.
_DEAD_SUBSCRIPTION_STATUSES = {404, 410}


def _send_one(subscription: PushSubscription, payload: dict[str, object]) -> int | None:
    """Returns the HTTP status on failure (for pruning), None on success."""
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
        )
        return None
    except WebPushException as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        logger.warning(f"Push delivery failed (endpoint={subscription.endpoint[:40]}...): {exc}")
        return status_code


async def _send_to_subscriptions(
    db: AsyncSession, subscriptions: Sequence[PushSubscription], payload: dict[str, object]
) -> int:
    """Deliver one payload to every given subscription, pruning dead
    endpoints along the way. Returns how many deliveries succeeded."""
    dead_endpoints: list[str] = []
    sent = 0
    for subscription in subscriptions:
        delivery_status = await run_in_threadpool(_send_one, subscription, payload)
        if delivery_status in _DEAD_SUBSCRIPTION_STATUSES:
            dead_endpoints.append(subscription.endpoint)
        elif delivery_status is None:
            sent += 1

    for endpoint in dead_endpoints:
        await crud.push_subscription.remove_by_endpoint(db, endpoint=endpoint)

    return sent


async def send_to_user(
    db: AsyncSession, *, user_id: int, title: str, body: str, url: str | None = None
) -> None:
    """Push a notification to every device a user has subscribed from.

    No-op when VAPID isn't configured, same 503-avoidance contract as R2:
    the feature silently does nothing rather than raising.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return

    subscriptions: Sequence[PushSubscription] = await crud.push_subscription.get_by_user(
        db, user_id=user_id
    )
    if not subscriptions:
        return

    payload: dict[str, object] = {"title": title, "body": body, "url": url}
    await _send_to_subscriptions(db, subscriptions, payload)


async def send_to_all(db: AsyncSession, *, title: str, body: str, url: str | None = None) -> int:
    """Broadcast one notification to every subscribed device — an admin
    announcement to every team at once ("chuva a chegar", "atraso no
    posto 4"), rather than addressed to a single participant.

    Returns how many deliveries succeeded, so the admin panel can show
    "enviado a N dispositivos" instead of a blind "done".
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return 0

    subscriptions = await crud.push_subscription.get_all(db)
    if not subscriptions:
        return 0

    payload: dict[str, object] = {"title": title, "body": body, "url": url}
    return await _send_to_subscriptions(db, subscriptions, payload)


class PushService:
    """Constructor-injected wrapper around web push delivery and
    subscription lifecycle — the piece the push controller used to do
    itself (VAPID guard repeated per-endpoint, `crud.push_subscription`
    calls, and the checkpoint lookup for a staff announcement's title).
    """

    def __init__(
        self,
        db: AsyncSession,
        push_subscription_crud: CRUDPushSubscription,
        checkpoint_crud: CRUDCheckPoint,
    ) -> None:
        self._db = db
        self._push_subscription_crud = push_subscription_crud
        self._checkpoint_crud = checkpoint_crud

    @staticmethod
    def _require_vapid_configured() -> None:
        if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=VAPID_NOT_CONFIGURED
            )

    async def subscribe(
        self, *, user_id: int, payload: PushSubscriptionCreate
    ) -> PushSubscriptionRead:
        self._require_vapid_configured()
        subscription = await self._push_subscription_crud.upsert(
            self._db, user_id=user_id, obj_in=payload
        )
        return PushSubscriptionRead.model_validate(subscription)

    async def unsubscribe(self, *, user_id: int, endpoint: str) -> None:
        existing = await self._push_subscription_crud.get_by_endpoint(self._db, endpoint=endpoint)
        if existing is not None and existing.user_id == user_id:
            await self._push_subscription_crud.remove_by_endpoint(self._db, endpoint=endpoint)

    async def broadcast(self, *, title: str, body: str, url: str | None) -> int:
        """Send one notification to every subscribed device — an admin
        announcement to all teams at once, not addressed to one participant.
        """
        self._require_vapid_configured()
        return await send_to_all(self._db, title=title, body=body, url=url)

    async def announce_from_checkpoint(
        self, *, checkpoint_id: int, body: str, url: str | None
    ) -> int:
        """Staff announcing something about their own post — reaches every
        team like an admin broadcast does (the whole rally needs to know a
        post is delayed or closed, not just teams already there); the post's
        own identity is stamped onto the title server-side so a staffer can't
        post as if they were a different checkpoint or a generic admin
        message.

        On a redacted route the title is the post's *number*, not its name:
        this reaches every team, and in a peddy paper the name of the place is
        the answer to the riddle they are still solving. Pushing it to teams
        that have not arrived hands them the solution.
        """
        self._require_vapid_configured()
        checkpoint = await self._checkpoint_crud.get(self._db, id=checkpoint_id)
        # ``settings`` is the app config in this module; the event's row is
        # a different thing.
        rally_config = await rally_settings.get_or_create(self._db)
        label = (
            checkpoint.name
            if getattr(rally_config, "reveal_next_checkpoint", True)
            else f"Posto {checkpoint.order}"
        )
        return await send_to_all(self._db, title=f"📍 {label}", body=body, url=url)
