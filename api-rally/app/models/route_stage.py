from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.checkpoint import CheckPoint


class RouteStage(Base):
    """A block of the route with its own progression rule.

    The event-wide ``checkpoint_order_matters`` cannot describe a route whose
    first half is walked in order and whose second half is a set of bars the
    team picks from. A stage carries that rule for its own posts:
    ``order_matters`` decides ordered versus free choice inside the stage, and
    ``required_count`` how many of its posts must be resolved before the next
    stage opens (NULL = all of them).

    Stages are contiguous blocks of checkpoint order — see
    ``CRUDCheckPoint.resequence``, which keeps posts grouped by stage — so the
    positional progress model (``team.times`` indexed by order) still holds.
    """

    __tablename__ = "route_stages"
    __table_args__: Any = (
        UniqueConstraint("event_id", "order", name="uq_route_stage_event_order"),
        {"schema": settings.SCHEMA_NAME},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey(f"{settings.SCHEMA_NAME}.rally_events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    order_matters: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # None means every post in the stage is required.
    required_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)

    checkpoints: Mapped[list["CheckPoint"]] = relationship(
        "CheckPoint", back_populates="stage", order_by="CheckPoint.order"
    )
