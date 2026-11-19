"""Web Push subscription store.

One row per (endpoint), the browser-issued subscription URL that uniquely
identifies a single device/browser install — iOS Safari included, as of
16.4, but only once the PWA is added to the Home Screen. Owned by exactly one
of a local user (staff/admin session) or a team (team-token session), so a
team's phones receive the rally-wide announcements too.
"""

from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base


class PushSubscription(Base):
    """A single browser Push API subscription, owned by a user or a team."""

    __tablename__ = "push_subscriptions"
    __table_args__ = (
        UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
        CheckConstraint(
            "(user_id IS NULL) <> (team_id IS NULL)",
            name="ck_push_subscriptions_single_owner",
        ),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.user.id", ondelete="CASCADE"), nullable=True
    )
    team_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey(f"{settings.SCHEMA_NAME}.teams.id", ondelete="CASCADE"), nullable=True
    )
    # The PushSubscription.endpoint URL — unique per device+browser install.
    endpoint: Mapped[str] = mapped_column(String(1024), nullable=False)
    # PushSubscriptionKeys, base64url-encoded, as returned by the browser.
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    def __repr__(self) -> str:
        return (
            f"<PushSubscription(user_id={self.user_id}, team_id={self.team_id}, "
            f"endpoint='{self.endpoint[:40]}...')>"
        )
