"""Section order for the report, and the page breaks between them.

A section that has nothing to say returns no flowables and gets no page
break, so an event that used none of the optional mechanics produces a short
document rather than a long one padded with empty headings.
"""

from __future__ import annotations

from collections.abc import Callable
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, SimpleDocTemplate

from app.services.event_report_context import EventReportContext
from app.services.report import (
    photos,
    sections_people,
    sections_route,
    sections_scores,
    sections_trails,
)

#: Built in order. Photos are appended separately because fetching them is
#: the one asynchronous step in the document.
SECTIONS: tuple[Callable[[EventReportContext], list[object]], ...] = (
    sections_scores.event_record,
    sections_scores.ranking,
    sections_people.teams_and_members,
    sections_people.staff,
    sections_people.guides,
    sections_scores.checkpoint_detail,
    sections_route.route_dossier,
    sections_people.progress,
    sections_trails.hints_and_skips,
    sections_trails.manual_awards,
    sections_trails.badges,
    sections_trails.evaluation_log,
    sections_trails.audit_log,
)


async def build_report(ctx: EventReportContext, event_id: int) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm)

    story: list[object] = sections_scores.cover(ctx, event_id)
    for build in SECTIONS:
        _append(story, build(ctx))

    _append(story, await photos.photos_section(ctx))
    _append(story, sections_scores.statistics(ctx))

    doc.build(story)
    return buffer.getvalue()


def _append(story: list[object], flowables: list[object]) -> None:
    """Add a section, with a page break only between two that exist."""
    if not flowables:
        return
    if story and not isinstance(story[-1], PageBreak):
        story.append(PageBreak())
    story.extend(flowables)
