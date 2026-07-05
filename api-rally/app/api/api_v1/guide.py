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

from fastapi import HTTPException

from app.api.deps import get_db, get_guide
from app.crud.crud_activity import rally_event
from app.crud.crud_rally_settings import rally_settings
from app.models.activity import EventType
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_media import CheckpointMedia, MediaKind
from app.schemas.user import DetailedUser

router = APIRouter()


class GuideMediaItem(BaseModel):
    id: int
    kind: str
    url: Optional[str]
    caption: Optional[str]
    display_order: int

    model_config = {"from_attributes": True}


class GuideIndicationItem(BaseModel):
    id: int
    hint: str
    question: Optional[str]
    expected_answer: Optional[str]
    order: int

    model_config = {"from_attributes": True}


class GuideCheckpointResponse(BaseModel):
    id: int
    name: str
    order: int
    description: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    media: List[GuideMediaItem]
    indications: List[GuideIndicationItem]

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

    settings = await rally_settings.get_or_create(db)
    guide_mode_on = settings.guide_mode_enabled and settings.guide_mode_active
    is_peddy_paper = event is not None and event.event_type == EventType.PEDDY_PAPER.value
    if not guide_mode_on and not is_peddy_paper:
        raise HTTPException(status_code=403, detail="Guide mode is not active for this event")

    event_filter = CheckPoint.event_id == event.id if event else CheckPoint.event_id.is_(None)

    stmt = (
        select(CheckPoint)
        .where(event_filter)
        .options(
            selectinload(CheckPoint.media),
            selectinload(CheckPoint.guide_indications),
        )
        .order_by(CheckPoint.order)
    )
    checkpoints = list((await db.scalars(stmt)).all())

    return [
        GuideCheckpointResponse(
            id=cp.id,
            name=cp.name,
            order=cp.order,
            description=cp.description,
            latitude=cp.latitude,
            longitude=cp.longitude,
            media=[
                GuideMediaItem(
                    id=m.id,
                    kind=m.kind.value if hasattr(m.kind, "value") else m.kind,
                    url=m.image_url,
                    caption=m.caption,
                    display_order=m.order,
                )
                for m in sorted(cp.media, key=lambda m: m.order)
            ],
            indications=[
                GuideIndicationItem(
                    id=i.id,
                    hint=i.hint,
                    question=i.question,
                    expected_answer=i.expected_answer,
                    order=i.order,
                )
                for i in sorted(cp.guide_indications, key=lambda i: i.order)
            ],
        )
        for cp in checkpoints
    ]
