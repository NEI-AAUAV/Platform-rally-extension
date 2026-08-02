"""Pydantic schemas for Web Push subscriptions."""

from pydantic import BaseModel, ConfigDict


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    """Body shape of the browser's `PushSubscription.toJSON()`."""

    endpoint: str
    keys: PushSubscriptionKeys


class PushSubscriptionUnsubscribe(BaseModel):
    endpoint: str


class PushSubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    endpoint: str


class VapidPublicKey(BaseModel):
    public_key: str | None
