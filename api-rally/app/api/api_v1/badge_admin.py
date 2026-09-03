"""Admin endpoints for badge catalogue management (A3).

BadgeDefinition CRUD + icon upload + manual award/revoke.
All write operations require admin scope.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
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
from app.schemas.user import DetailedUser
from app.services import badge_service
from app.services.audit_service import AuditActor, record_audit
from app.services.image_upload import ALLOWED_PHOTO_CONTENT_TYPES, validate_and_store
from app.services.storage import storage_client

BADGE_DEFINITION_NOT_FOUND = "Badge definition not found"


class BadgeAdminController:
    """REST controller for badge-definition/badge admin management."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/badge-definitions",
            self.list_badge_definitions,
            methods=["GET"],
            name="list_badge_definitions",
        )
        self.router.add_api_route(
            "/badge-definitions",
            self.create_badge_definition,
            methods=["POST"],
            status_code=201,
            name="create_badge_definition",
            dependencies=[Depends(deps.get_admin), Depends(self.require_badges_enabled)],
            responses={409: {"description": "Badge code already exists"}},
        )
        self.router.add_api_route(
            "/badge-definitions/{id}",
            self.update_badge_definition,
            methods=["PUT"],
            name="update_badge_definition",
            dependencies=[Depends(deps.get_admin), Depends(self.require_badges_enabled)],
            responses={404: {"description": BADGE_DEFINITION_NOT_FOUND}},
        )
        self.router.add_api_route(
            "/badge-definitions/{id}/icon",
            self.upload_badge_icon,
            methods=["POST"],
            name="upload_badge_icon",
            dependencies=[Depends(deps.get_admin), Depends(self.require_badges_enabled)],
            responses={404: {"description": BADGE_DEFINITION_NOT_FOUND}},
        )
        self.router.add_api_route(
            "/badge-definitions/{id}",
            self.delete_badge_definition,
            methods=["DELETE"],
            status_code=204,
            name="delete_badge_definition",
            dependencies=[Depends(deps.get_admin), Depends(self.require_badges_enabled)],
            responses={404: {"description": BADGE_DEFINITION_NOT_FOUND}},
        )
        self.router.add_api_route(
            "/badges/award",
            self.manual_award_badge,
            methods=["POST"],
            status_code=201,
            name="manual_award_badge",
            dependencies=[Depends(deps.get_admin), Depends(self.require_badges_enabled)],
            responses={
                404: {"description": BADGE_DEFINITION_NOT_FOUND},
                400: {"description": "Badge is inactive"},
                409: {"description": "Team already holds this badge"},
            },
        )
        self.router.add_api_route(
            "/badges/{badge_id}",
            self.revoke_badge,
            methods=["DELETE"],
            status_code=204,
            name="revoke_badge",
            dependencies=[Depends(deps.get_admin), Depends(self.require_badges_enabled)],
            responses={404: {"description": "Badge not found"}},
        )

    async def require_badges_enabled(
        self, db: Annotated[AsyncSession, Depends(deps.get_db)]
    ) -> None:
        """Block badge write operations when the feature is switched off.

        The catalog list (GET) stays reachable so an admin can still inspect
        definitions, but every mutation is refused while the kill-switch is off.
        """
        settings = await rally_settings.get_or_create(db)
        if not settings.badges_enabled:
            raise HTTPException(status_code=403, detail="Badges feature is disabled")

    async def list_badge_definitions(
        self, db: Annotated[AsyncSession, Depends(deps.get_db)]
    ) -> list[BadgeDefinitionResponse]:
        items = await crud_def.get_all(db)
        return [BadgeDefinitionResponse.model_validate(item) for item in items]

    async def create_badge_definition(
        self,
        obj_in: BadgeDefinitionCreate,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
    ) -> BadgeDefinitionResponse:
        existing = await crud_def.get_by_code(db, code=obj_in.code)
        if existing:
            raise HTTPException(status_code=409, detail="Badge code already exists")
        created = await crud_def.create(db, obj_in=obj_in)
        return BadgeDefinitionResponse.model_validate(created)

    async def update_badge_definition(
        self,
        id: int,
        obj_in: BadgeDefinitionUpdate,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
    ) -> BadgeDefinitionResponse:
        db_obj = await crud_def.get(db, id=id)
        if not db_obj:
            raise HTTPException(status_code=404, detail=BADGE_DEFINITION_NOT_FOUND)
        updated = await crud_def.update(db, db_obj=db_obj, obj_in=obj_in)
        return BadgeDefinitionResponse.model_validate(updated)

    async def upload_badge_icon(
        self,
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
        try:
            updated = await crud_def.update(
                db, db_obj=db_obj, obj_in=BadgeDefinitionUpdate(), icon_url=icon_url
            )
        except Exception:
            storage_client.delete_image(icon_url)
            raise
        return BadgeDefinitionResponse.model_validate(updated)

    async def delete_badge_definition(
        self, id: int, db: Annotated[AsyncSession, Depends(deps.get_db)]
    ) -> None:
        db_obj = await crud_def.get(db, id=id)
        if not db_obj:
            raise HTTPException(status_code=404, detail=BADGE_DEFINITION_NOT_FOUND)
        await crud_def.delete(db, db_obj=db_obj)

    async def manual_award_badge(
        self,
        obj_in: ManualBadgeAwardCreate,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_admin)],
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
        await record_audit(
            db,
            action="badge.granted",
            actor=AuditActor(id=str(curr_user.id), name=curr_user.name, kind="staff"),
            target_type="team_badge",
            target_id=str(badge.id),
            note=f"badge_code={obj_in.badge_code} team_id={obj_in.team_id}",
        )
        return TeamBadgeRead.model_validate(badge)

    async def revoke_badge(
        self,
        badge_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        curr_user: Annotated[DetailedUser, Depends(deps.get_admin)],
    ) -> None:
        result = await db.execute(select(TeamBadge).where(TeamBadge.id == badge_id))
        badge = result.scalars().first()
        if not badge:
            raise HTTPException(status_code=404, detail="Badge not found")
        note = f"badge_type={badge.badge_type} team_id={badge.team_id}"
        await db.delete(badge)
        await db.commit()
        await record_audit(
            db,
            action="badge.revoked",
            actor=AuditActor(id=str(curr_user.id), name=curr_user.name, kind="staff"),
            target_type="team_badge",
            target_id=str(badge_id),
            note=note,
        )


router = BadgeAdminController().router
