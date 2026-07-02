"""Admin endpoints for badge catalogue management (A3).

BadgeDefinition CRUD + icon upload + manual award/revoke.
All write operations require admin scope.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud.crud_badge_definition import badge_definition as crud_def
from app.crud.crud_rally_settings import rally_settings
from app.models.badge import BadgeType, TeamBadge
from app.models.badge_definition import BadgeDefinition
from app.schemas.badge_definition import (
    BadgeDefinitionCreate,
    BadgeDefinitionResponse,
    BadgeDefinitionUpdate,
    ManualBadgeAwardCreate,
)
from app.schemas.badge import TeamBadgeRead
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store

router = APIRouter()


async def require_badges_enabled(db: AsyncSession = Depends(deps.get_db)) -> None:
    """Block badge write operations when the feature is switched off.

    The catalog list (GET) stays reachable so an admin can still inspect
    definitions, but every mutation is refused while the kill-switch is off.
    """
    settings = await rally_settings.get_or_create(db)
    if not settings.badges_enabled:
        raise HTTPException(status_code=403, detail="Badges feature is disabled")


@router.get("/badge-definitions", response_model=List[BadgeDefinitionResponse])
async def list_badge_definitions(
    db: AsyncSession = Depends(deps.get_db),
) -> List[BadgeDefinitionResponse]:
    return await crud_def.get_all(db)


@router.post(
    "/badge-definitions",
    response_model=BadgeDefinitionResponse,
    status_code=201,
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
)
async def create_badge_definition(
    obj_in: BadgeDefinitionCreate,
    db: AsyncSession = Depends(deps.get_db),
) -> BadgeDefinitionResponse:
    existing = await crud_def.get_by_code(db, code=obj_in.code)
    if existing:
        raise HTTPException(status_code=409, detail="Badge code already exists")
    return await crud_def.create(db, obj_in=obj_in)


@router.put(
    "/badge-definitions/{id}",
    response_model=BadgeDefinitionResponse,
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
)
async def update_badge_definition(
    id: int,
    obj_in: BadgeDefinitionUpdate,
    db: AsyncSession = Depends(deps.get_db),
) -> BadgeDefinitionResponse:
    db_obj = await crud_def.get(db, id=id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Badge definition not found")
    return await crud_def.update(db, db_obj=db_obj, obj_in=obj_in)


@router.post(
    "/badge-definitions/{id}/icon",
    response_model=BadgeDefinitionResponse,
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
)
async def upload_badge_icon(
    id: int,
    image: UploadFile = File(...),
    db: AsyncSession = Depends(deps.get_db),
) -> BadgeDefinitionResponse:
    db_obj = await crud_def.get(db, id=id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Badge definition not found")
    icon_url = await validate_and_store(
        image=image,
        allowed_content_types=ALLOWED_PHOTO_CONTENT_TYPES,
        key_prefix=f"rally/badges/{id}",
    )
    return await crud_def.update(db, db_obj=db_obj, obj_in=BadgeDefinitionUpdate(), icon_url=icon_url)


@router.delete(
    "/badge-definitions/{id}",
    status_code=204,
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
)
async def delete_badge_definition(
    id: int,
    db: AsyncSession = Depends(deps.get_db),
) -> None:
    db_obj = await crud_def.get(db, id=id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Badge definition not found")
    await crud_def.delete(db, db_obj=db_obj)


@router.post(
    "/badges/award",
    response_model=TeamBadgeRead,
    status_code=201,
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
)
async def manual_award_badge(
    obj_in: ManualBadgeAwardCreate,
    db: AsyncSession = Depends(deps.get_db),
) -> TeamBadgeRead:
    defn = await crud_def.get_by_code(db, code=obj_in.badge_code)
    if not defn:
        raise HTTPException(status_code=404, detail="Badge definition not found")
    if not defn.is_active:
        raise HTTPException(status_code=400, detail="Badge is inactive")

    from sqlalchemy import select as sa_select
    from sqlalchemy.exc import IntegrityError

    # Check idempotency
    existing_check = await db.execute(
        sa_select(TeamBadge).where(
            TeamBadge.team_id == obj_in.team_id,
            TeamBadge.badge_type == obj_in.badge_code,
            TeamBadge.activity_id == obj_in.activity_id,
            TeamBadge.checkpoint_id == obj_in.checkpoint_id,
        )
    )
    if existing_check.scalars().first():
        raise HTTPException(status_code=409, detail="Team already holds this badge")

    badge = TeamBadge(
        team_id=obj_in.team_id,
        badge_type=obj_in.badge_code,
        activity_id=obj_in.activity_id,
        checkpoint_id=obj_in.checkpoint_id,
        meta={"manual": True},
    )
    db.add(badge)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Team already holds this badge")
    await db.refresh(badge)
    return TeamBadgeRead.model_validate(badge)


@router.delete(
    "/badges/{badge_id}",
    status_code=204,
    dependencies=[Depends(deps.get_admin), Depends(require_badges_enabled)],
)
async def revoke_badge(
    badge_id: int,
    db: AsyncSession = Depends(deps.get_db),
) -> None:
    from sqlalchemy import select as sa_select
    result = await db.execute(sa_select(TeamBadge).where(TeamBadge.id == badge_id))
    badge = result.scalars().first()
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    await db.delete(badge)
    await db.commit()
