"""Admin export of an event's results as a multi-sheet Excel workbook."""

from typing import Annotated

from fastapi import APIRouter, Depends, Security
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_admin, get_db
from app.core.exceptions import RallyNotFoundError
from app.schemas.user import DetailedUser
from app.services.deps import get_export_service
from app.services.export_service import ExportService

_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _safe_filename(name: str) -> str:
    """ASCII-safe, filesystem-safe basename for the Content-Disposition header."""
    cleaned = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in name)
    return cleaned.strip("_") or "event"


class ExportController:
    """REST controller for admin event-results export."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/events/{event_id}/export",
            self.export_event_results,
            methods=["GET"],
            name="export_event_results",
            tags=["Events"],
            responses={404: {"description": "Event not found"}},
        )

    async def export_event_results(
        self,
        event_id: int,
        db: Annotated[AsyncSession, Depends(get_db)],
        _admin: Annotated[DetailedUser, Depends(get_admin)],
        _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
        service: Annotated[ExportService, Depends(get_export_service)],
    ) -> Response:
        """Return an .xlsx workbook of the event's results (admin/manager only)."""
        event = await crud.rally_event.get(db, event_id)
        if event is None:
            raise RallyNotFoundError("Event not found")

        content = await service.build_workbook(event_id)
        filename = f"{_safe_filename(event.name)}_results.xlsx"
        return Response(
            content=content,
            media_type=_XLSX_MEDIA_TYPE,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


router = ExportController().router
