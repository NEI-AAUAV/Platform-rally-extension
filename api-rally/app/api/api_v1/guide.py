"""Rally guide endpoints (C1).

A rally-guide user can view checkpoint details including their media gallery
(photos/videos uploaded by admins). This gives tour guides a read-only view
of the checkpoints they're accompanying teams through.

Guides, staff, admins, and managers all have access. Public users do not.
"""
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_guide
from app.crud.crud_activity import rally_event
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_media import CheckpointMedia, MediaKind
from app.schemas.user import DetailedUser

router = APIRouter()


class GuideMediaItem(BaseModel):
    id: int
    kind: str
    url: str
    caption: Optional[str]
    display_order: int

    model_config = {"from_attributes": True}


class GuideCheckpointResponse(BaseModel):
    id: int
    name: str
    order: int
    description: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    media: List[GuideMediaItem]

    model_config = {"from_attributes": True}


@router.get("/guide/checkpoints", response_model=List[GuideCheckpointResponse])
async def list_guide_checkpoints(
    db: AsyncSession = Depends(get_db),
    _: DetailedUser = Depends(get_guide),
) -> List[GuideCheckpointResponse]:
    """Return all checkpoints with their media gallery for the current event.

    Ordered by checkpoint order. Guide role, staff, and admins can access this.
    """
    event = await rally_event.get_current(db)
    event_filter = CheckPoint.event_id == event.id if event else CheckPoint.event_id.is_(None)

    stmt = (
        select(CheckPoint)
        .where(event_filter)
        .options(selectinload(CheckPoint.media))
        .order_by(CheckPoint.order)
    )
    checkpoints = list((await db.scalars(stmt)).all())

    return [
        GuideCheckpointResponse(
            id=cp.id,
            name=cp.name,
            order=cp.order,
            description=getattr(cp, "description", None),
            latitude=cp.latitude,
            longitude=cp.longitude,
            media=[
                GuideMediaItem(
                    id=m.id,
                    kind=m.kind,
                    url=m.url,
                    caption=m.caption,
                    display_order=m.display_order,
                )
                for m in sorted(cp.media, key=lambda m: m.display_order)
            ],
        )
        for cp in checkpoints
    ]
