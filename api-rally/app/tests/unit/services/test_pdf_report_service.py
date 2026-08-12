"""Unit tests for PdfReportService document construction.

Mirrors test_export_service.py's approach: DB reads are stubbed (via a
stubbed EventResultsQuery) so no database is needed, and photo downloads are
mocked so no network is needed either. Only asserts on the PDF's byte-level
shape (starts with the %PDF magic, is non-trivially sized) — reportlab's
own layout is trusted; this is checking *our* aggregation/wiring, not
reportlab's rendering.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services.event_results_query import EventResultsData
from app.services.pdf_report_service import PdfReportService


def _team(tid: int, name: str, photo_url: str = ""):
    return SimpleNamespace(id=tid, name=name, versus_group_id=None, photo_url=photo_url)


def _cp(cid: int, order: int, name: str = "CP"):
    return SimpleNamespace(id=cid, order=order, event_id=1, name=name)


def _result(team_id: int, checkpoint_id: int, *, final_score=6.0, media_urls=None, **kw):
    return SimpleNamespace(
        team_id=team_id,
        activity=SimpleNamespace(checkpoint=SimpleNamespace(id=checkpoint_id)),
        is_completed=True,
        final_score=final_score,
        extra_shots=kw.get("extra_shots", 0),
        penalties=kw.get("penalties", {}),
        result_data=kw.get("result_data", {}),
        media_urls=media_urls or [],
    )


def _event(name="Test Event"):
    return SimpleNamespace(id=1, name=name, start_time=None, end_time=None)


def _service(teams, checkpoints, results) -> PdfReportService:
    from reportlab.lib.styles import getSampleStyleSheet

    svc = PdfReportService.__new__(PdfReportService)
    svc._styles = getSampleStyleSheet()

    class _StubQuery:
        async def load(self, _event_id):
            return EventResultsData(teams=teams, checkpoints=checkpoints, results=results)

    svc.db = None
    svc._query = _StubQuery()
    return svc


async def _build(event, teams, checkpoints, results):
    with patch(
        "app.services.pdf_report_service.crud_rally_event.get",
        new=AsyncMock(return_value=event),
    ):
        svc = _service(teams, checkpoints, results)
        return await svc.build_report(1)


class TestBuildReport:
    async def test_produces_a_valid_pdf(self):
        content = await _build(_event(), [_team(1, "A")], [_cp(10, 1)], [])
        assert content.startswith(b"%PDF")
        assert len(content) > 500

    async def test_empty_event_still_produces_a_pdf(self):
        content = await _build(_event(), [], [], [])
        assert content.startswith(b"%PDF")

    async def test_missing_event_falls_back_to_placeholder_title(self):
        content = await _build(None, [_team(1, "A")], [_cp(10, 1)], [])
        assert content.startswith(b"%PDF")


class TestPhotoUrls:
    def test_includes_team_photos(self):
        data = EventResultsData(
            teams=[_team(1, "A", photo_url="https://x/a.png")], checkpoints=[], results=[]
        )
        pairs = PdfReportService._photo_urls(data)
        assert ("Equipa: A", "https://x/a.png") in pairs

    def test_skips_teams_without_a_photo(self):
        data = EventResultsData(teams=[_team(1, "A", photo_url="")], checkpoints=[], results=[])
        assert PdfReportService._photo_urls(data) == []

    def test_includes_capture_photos_from_results(self):
        data = EventResultsData(
            teams=[_team(1, "A")],
            checkpoints=[],
            results=[_result(1, 10, media_urls=["https://x/capture1.png"])],
        )
        pairs = PdfReportService._photo_urls(data)
        assert ("Captura da equipa #1", "https://x/capture1.png") in pairs

    def test_caps_at_max_photos(self):
        team = _team(1, "A")
        results = [_result(1, 10, media_urls=[f"https://x/{i}.png"]) for i in range(50)]
        data = EventResultsData(teams=[team], checkpoints=[], results=results)
        pairs = PdfReportService._photo_urls(data)
        assert len(pairs) <= 24


class TestDownloadImage:
    def test_returns_none_on_request_failure(self):
        import requests

        with patch(
            "app.services.pdf_report_service.requests.get",
            side_effect=requests.exceptions.ConnectionError("boom"),
        ):
            assert PdfReportService._download_image("https://x/broken.png") is None
