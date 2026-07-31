"""Web Push delivery: sends a notification payload to every subscription a
user holds. pywebpush is sync (built on `requests`), so calls run in a
worker thread via `run_in_threadpool` to avoid blocking the event loop.

Fire-and-forget by design, mirroring EVENTS_FAIL_SILENTLY: a push failure
(dead endpoint, missing VAPID config, network error) is logged and never
propagated to the caller — a lost notification must not fail the request
that triggered it (e.g. a badge award).
"""

import json
from collections.abc import Sequence

from fastapi.concurrency import run_in_threadpool
from loguru import logger
from pywebpush import WebPushException, webpush
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.core.config import settings
from app.models.push_subscription import PushSubscription

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
        status = exc.response.status_code if exc.response is not None else None
        logger.warning(f"Push delivery failed (endpoint={subscription.endpoint[:40]}...): {exc}")
        return status


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

    payload = {"title": title, "body": body, "url": url}
    dead_endpoints: list[str] = []
    for subscription in subscriptions:
        status = await run_in_threadpool(_send_one, subscription, payload)
        if status in _DEAD_SUBSCRIPTION_STATUSES:
            dead_endpoints.append(subscription.endpoint)

    for endpoint in dead_endpoints:
        await crud.push_subscription.remove_by_endpoint(db, endpoint=endpoint)
