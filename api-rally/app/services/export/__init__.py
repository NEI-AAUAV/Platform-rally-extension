"""Excel workbook construction for an event dossier.

Split by sheet family rather than kept in one module: the workbook now has
around twenty sheets, and each family (results, route, people, audit) reads
a different part of the report context.

`app.services.export_service.ExportService` remains the public entry point,
so dependency wiring and routes are unaffected.
"""

from app.services.export.workbook import build_workbook

__all__ = ["build_workbook"]
