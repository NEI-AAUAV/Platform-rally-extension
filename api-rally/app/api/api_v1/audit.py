"""Admin read access to the general audit trail (see app.models.audit_log)."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_admin, get_db
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogEntry
from app.schemas.user import DetailedUser

MAX_PAGE_SIZE = 200


class AuditController:
    """REST controller for /audit."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/audit",
            self.list_audit_log,
            methods=["GET"],
            name="list_audit_log",
        )

    async def list_audit_log(
        self,
        *,
        db: Annotated[AsyncSession, Depends(get_db)],
        _admin: Annotated[DetailedUser, Depends(get_admin)],
        action: str | None = None,
        actor_id: str | None = None,
        target_type: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> list[AuditLogEntry]:
        """Filtered, paginated audit trail — admin only.

        ``action`` matches by prefix (e.g. "badge." matches both
        "badge.granted" and "badge.revoked") so a caller can filter by
        category without enumerating every specific action.
        """
        stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
        if action:
            stmt = stmt.where(AuditLog.action.startswith(action))
        if actor_id:
            stmt = stmt.where(AuditLog.actor_id == actor_id)
        if target_type:
            stmt = stmt.where(AuditLog.target_type == target_type)
        if since:
            stmt = stmt.where(AuditLog.created_at >= since)
        if until:
            stmt = stmt.where(AuditLog.created_at <= until)
        stmt = stmt.limit(limit).offset(offset)

        rows = (await db.scalars(stmt)).all()
        return [AuditLogEntry.model_validate(row) for row in rows]


router = AuditController().router
