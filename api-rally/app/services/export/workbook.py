"""Sheet order for the event dossier workbook.

Overview first, then the flat Results sheet the aggregates read, then the
scores, the route, the people and the trails. Every builder past the first
two returns without creating a sheet when its data is absent, so a small
event yields a small workbook.
"""

from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook

from app.services.event_report_context import EventReportContext
from app.services.export import sheets_audit, sheets_people, sheets_results, sheets_route


def build_workbook(ctx: EventReportContext) -> bytes:
    wb = Workbook()

    sheets_results.build_overview_sheet(wb, ctx)
    # Built before anything that aggregates over it: the returned index is
    # what every SUMIF/AVERAGEIF elsewhere addresses its ranges with.
    index = sheets_results.build_results_sheet(wb, ctx)
    sheets_results.build_overall_sheet(wb, ctx)
    sheets_results.build_checkpoint_sheets(wb, ctx)

    sheets_route.build_checkpoints_sheet(wb, ctx, index)
    sheets_route.build_activities_sheet(wb, ctx, index)
    sheets_route.build_hint_ladder_sheet(wb, ctx)
    sheets_route.build_media_sheet(wb, ctx)
    sheets_route.build_stages_sheet(wb, ctx)

    sheets_people.build_staff_sheet(wb, ctx)
    sheets_people.build_guides_sheet(wb, ctx)
    sheets_people.build_members_sheet(wb, ctx)
    sheets_people.build_progress_sheet(wb, ctx)

    sheets_audit.build_hints_sheet(wb, ctx)
    sheets_audit.build_skips_sheet(wb, ctx)
    sheets_audit.build_awards_sheet(wb, ctx)
    sheets_audit.build_badges_sheet(wb, ctx)
    sheets_audit.build_evaluation_log_sheet(wb, ctx)
    sheets_audit.build_audit_log_sheet(wb, ctx)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
