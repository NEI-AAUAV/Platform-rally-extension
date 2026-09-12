"""Excel export of an event's full dossier.

A multi-sheet workbook covering the scores, the route as it was planned, the
people who ran and played the event, and both audit trails. Sheet
construction lives in `app.services.export`; this module is the service
boundary, so dependency wiring (`app/services/deps.py`) and the route
(`app/api/api_v1/export.py`) stay pointed at one stable name.

The export is a plain read of persisted rows scoped to the event; it never
recomputes scores. The formulas it writes only re-derive totals and averages
from those values, so correcting a cell re-totals its sheet.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.event_report_query import EventReportQuery
from app.services.export.workbook import build_workbook


class ExportService:
    """Builds the dossier workbook for a single event."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._query = EventReportQuery(db)

    async def build_workbook(self, event_id: int) -> bytes:
        return build_workbook(await self._query.load(event_id))
