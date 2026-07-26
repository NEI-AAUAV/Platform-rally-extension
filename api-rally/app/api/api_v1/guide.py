"""Rally guide endpoints (C1).

A rally-guide user can view checkpoint details including their media gallery
(photos/videos uploaded by admins). This gives tour guides a read-only view
of the checkpoints they're accompanying teams through.

Guides, staff, admins, and managers all have access. Public users do not.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_guide
from app.schemas.user import DetailedUser
from app.services.guide_service import GuideService


class GuideMediaItem(BaseModel):
    id: int
    kind: str
    url: str | None = None
    caption: str | None = None
    display_order: int

    model_config = {"from_attributes": True}


class GuideIndicationItem(BaseModel):
    id: int
    hint: str
    question: str | None = None
    expected_answer: str | None = None
    order: int

    model_config = {"from_attributes": True}


class GuideCheckpointResponse(BaseModel):
    id: int
    name: str
    order: int
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    media: list[GuideMediaItem]
    indications: list[GuideIndicationItem]

    model_config = {"from_attributes": True}


class GuideController:
    """REST controller for rally guide read-only checkpoint views."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/guide/checkpoints",
            self.list_guide_checkpoints,
            methods=["GET"],
            name="list_guide_checkpoints",
            responses={403: {"description": "Guide mode is not active for this event"}},
        )

    async def list_guide_checkpoints(
        self,
        db: Annotated[AsyncSession, Depends(get_db)],
        _: Annotated[DetailedUser, Depends(get_guide)],
    ) -> list[GuideCheckpointResponse]:
        """Return all checkpoints with their media gallery for the current event.

        Ordered by checkpoint order. Guide role, staff, and admins can access this.
        """
        checkpoints = await GuideService(db).list_checkpoints_with_gallery()

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


router = GuideController().router
