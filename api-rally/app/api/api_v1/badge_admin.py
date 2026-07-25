"""Admin endpoints for badge catalogue management (A3).

BadgeDefinition CRUD + icon upload + manual award/revoke.
All write operations require admin scope.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud.crud_badge_definition import badge_definition as crud_def
from app.crud.crud_rally_settings import rally_settings
from app.models.badge import TeamBadge
from app.schemas.badge import TeamBadgeRead
from app.schemas.badge_definition import (
    BadgeDefinitionCreate,
    BadgeDefinitionResponse,
    BadgeDefinitionUpdate,
    ManualBadgeAwardCreate,
)
from app.services import badge_service
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store

router = APIRouter()

BADGE_DEFINITION_NOT_FOUND = "Badge definition not found"


async def require_badges_enabled(db: Annotated[AsyncSession, Depends(deps.get_db)]) -> None:
    """Block badge write operations when the feature is switched off.

    The catalog list (GET) stays reachable so an admin can still inspect
    definitions, but every mutation is refused while the kill-switch is off.
    """
    settings = await rally_settings.get_or_create(db)
    if not settings.badges_enabled:
        raise HTTPException(status_code=403, detail="Badges feature is disabled")


@router.get("/badge-definitions")
async def list_badge_definitions(
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> list[BadgeDefinitionResponse]:
    items = await crud_def.get_all(db)
    return [BadgeDefinitionResponse.model_validate(item) for item in items]


@router.post(
    "/badge-definitions",
    status_code=201,
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
    responses={409: {"description": "Badge code already exists"}},
)
async def create_badge_definition(
    obj_in: BadgeDefinitionCreate,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> BadgeDefinitionResponse:
    existing = await crud_def.get_by_code(db, code=obj_in.code)
    if existing:
        raise HTTPException(status_code=409, detail="Badge code already exists")
    created = await crud_def.create(db, obj_in=obj_in)
    return BadgeDefinitionResponse.model_validate(created)


@router.put(
    "/badge-definitions/{id}",
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
    responses={404: {"description": BADGE_DEFINITION_NOT_FOUND}},
)
async def update_badge_definition(
    id: int,
    obj_in: BadgeDefinitionUpdate,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> BadgeDefinitionResponse:
    db_obj = await crud_def.get(db, id=id)
    if not db_obj:
        raise HTTPException(status_code=404, detail=BADGE_DEFINITION_NOT_FOUND)
    updated = await crud_def.update(db, db_obj=db_obj, obj_in=obj_in)
    return BadgeDefinitionResponse.model_validate(updated)


@router.post(
    "/badge-definitions/{id}/icon",
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
    responses={404: {"description": BADGE_DEFINITION_NOT_FOUND}},
)
async def upload_badge_icon(
    id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    image: Annotated[UploadFile, File()],
) -> BadgeDefinitionResponse:
    db_obj = await crud_def.get(db, id=id)
    if not db_obj:
        raise HTTPException(status_code=404, detail=BADGE_DEFINITION_NOT_FOUND)
    icon_url = await validate_and_store(
        image=image,
        allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
        key_prefix=f"rally/badges/{id}",
    )
    updated = await crud_def.update(
        db, db_obj=db_obj, obj_in=BadgeDefinitionUpdate(), icon_url=icon_url
    )
    return BadgeDefinitionResponse.model_validate(updated)


@router.delete(
    "/badge-definitions/{id}",
    status_code=204,
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
    responses={404: {"description": BADGE_DEFINITION_NOT_FOUND}},
)
async def delete_badge_definition(
    id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> None:
    db_obj = await crud_def.get(db, id=id)
    if not db_obj:
        raise HTTPException(status_code=404, detail=BADGE_DEFINITION_NOT_FOUND)
    await crud_def.delete(db, db_obj=db_obj)


@router.post(
    "/badges/award",
    status_code=201,
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
    responses={
        404: {"description": BADGE_DEFINITION_NOT_FOUND},
        400: {"description": "Badge is inactive"},
        409: {"description": "Team already holds this badge"},
    },
)
async def manual_award_badge(
    obj_in: ManualBadgeAwardCreate,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> TeamBadgeRead:
    defn = await crud_def.get_by_code(db, code=obj_in.badge_code)
    if not defn:
        raise HTTPException(status_code=404, detail=BADGE_DEFINITION_NOT_FOUND)
    if not defn.is_active:
        raise HTTPException(status_code=400, detail="Badge is inactive")

    badge = await badge_service.manual_award_badge(
        db,
        team_id=obj_in.team_id,
        badge_code=obj_in.badge_code,
        activity_id=obj_in.activity_id,
        checkpoint_id=obj_in.checkpoint_id,
    )
    return TeamBadgeRead.model_validate(badge)


@router.delete(
    "/badges/{badge_id}",
    status_code=204,
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
    responses={404: {"description": "Badge not found"}},
)
async def revoke_badge(
    badge_id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> None:
    from sqlalchemy import select as sa_select

    result = await db.execute(sa_select(TeamBadge).where(TeamBadge.id == badge_id))
    badge = result.scalars().first()
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    await db.delete(badge)
    await db.commit()
