"""PDF final report for a single event.

A printable, archivable dossier: the ranking, the teams and who was in them,
the staff and guides who ran it, the route as it was planned (briefings,
challenges and the hint ladder's answer key included), what each team did at
each post, the photos captured, and both audit trails.

Section construction lives in `app.services.report`; this module is the
service boundary, so dependency wiring (`app/services/deps.py`) and the route
(`app/api/api_v1/export.py`) stay pointed at one stable name.

Every section past the ranking is conditional: it appears only if the event
produced the thing it describes. The alternative — a fixed template — is what
made an earlier version of this report describe an event that never happened.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.event_report_query import EventReportQuery
from app.services.report.document import build_report


class PdfReportService:
    """Builds the final-report PDF for a single event."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._query = EventReportQuery(db)

    async def build_report(self, event_id: int) -> bytes:
        return await build_report(await self._query.load(event_id), event_id)
