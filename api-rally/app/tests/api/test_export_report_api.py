"""API tests for the event PDF report endpoint, against real Postgres."""

from unittest.mock import patch

import pytest
import requests

from app.tests.api.test_export_api import _seed_event

pytestmark = pytest.mark.asyncio

_PDF_MEDIA_TYPE = "application/pdf"


async def test_report_requires_admin(pg_session, pg_client, as_user):
    seed = await _seed_event(pg_session)
    resp = pg_client.get(f"/api/rally/v1/events/{seed['event'].id}/report")
    assert resp.status_code == 403


def test_report_event_not_found(pg_client, as_admin):
    resp = pg_client.get("/api/rally/v1/events/999999/report")
    assert resp.status_code == 404


async def test_report_returns_pdf(pg_session, pg_client, as_admin):
    seed = await _seed_event(pg_session)

    resp = pg_client.get(f"/api/rally/v1/events/{seed['event'].id}/report")

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == _PDF_MEDIA_TYPE
    assert "attachment" in resp.headers["content-disposition"]
    assert "Rally_Export_relatorio.pdf" in resp.headers["content-disposition"]
    assert resp.content.startswith(b"%PDF")


async def test_report_works_with_no_teams_or_photos(pg_session, pg_client, as_admin):
    from app.models.activity import RallyEvent

    event = RallyEvent(name="Empty Event", event_type="rally_tascas")
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)

    resp = pg_client.get(f"/api/rally/v1/events/{event.id}/report")

    assert resp.status_code == 200, resp.text
    assert resp.content.startswith(b"%PDF")


async def test_report_skips_photo_with_disallowed_host_without_failing(
    pg_session, pg_client, as_admin
):
    """A photo_url pointing outside the configured R2 bucket (bad data, or a
    future field that accepts an arbitrary URL) must not crash report
    generation — see PdfReportService._is_safe_photo_url."""
    seed = await _seed_event(pg_session)
    seed["team_a"].photo_url = "https://example.invalid/does-not-exist.png"
    await pg_session.commit()

    resp = pg_client.get(f"/api/rally/v1/events/{seed['event'].id}/report")

    assert resp.status_code == 200, resp.text
    assert resp.content.startswith(b"%PDF")


async def test_report_skips_photo_that_fails_to_download_without_failing(
    pg_session, pg_client, as_admin
):
    seed = await _seed_event(pg_session)
    seed["team_a"].photo_url = "https://example.invalid/does-not-exist.png"
    await pg_session.commit()

    with (
        patch(
            "app.services.pdf_report_service.PdfReportService._is_safe_photo_url",
            return_value=True,
        ),
        patch(
            "app.services.pdf_report_service.requests.get",
            side_effect=requests.exceptions.ConnectionError("simulated network failure"),
        ),
    ):
        resp = pg_client.get(f"/api/rally/v1/events/{seed['event'].id}/report")

    assert resp.status_code == 200, resp.text
    assert resp.content.startswith(b"%PDF")
