"""PDF report construction for an event dossier.

Split by section family for the same reason the Excel package is: one module
per part of the report context, with `document.py` owning the order the
sections appear in and the page breaks between them.

`app.services.pdf_report_service.PdfReportService` remains the public entry
point, so dependency wiring and routes are unaffected.
"""
