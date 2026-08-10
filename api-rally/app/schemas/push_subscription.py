"""Pydantic schemas for Web Push subscriptions."""

from pydantic import BaseModel, ConfigDict, Field


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


class PushBroadcastRequest(BaseModel):
    """An admin announcement sent to every subscribed device at once."""

    title: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=500)
    url: str | None = None


class PushCheckpointAnnouncementRequest(BaseModel):
    """A staff announcement about their own post. No `title` — the post's
    name is stamped on automatically, so the announcement can't masquerade
    as being about a different checkpoint or as a generic admin broadcast."""

    body: str = Field(min_length=1, max_length=500)
    url: str | None = None


class PushBroadcastResult(BaseModel):
    sent: int
