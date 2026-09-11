"""Unit tests for PdfReportService document construction.

Mirrors test_export_service.py's approach: DB reads are stubbed (via a
stubbed EventResultsQuery) so no database is needed, and photo downloads are
mocked so no network is needed either.

`build_report` is asserted only at the byte level (starts with the %PDF
magic, non-trivially sized) — reportlab's layout is trusted. What each
section decides to emit is asserted against the section builders directly,
since that is our logic, and "this section is absent" is most of what these
tests are for.
"""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from reportlab.platypus import Paragraph

from app.services.event_results_query import EventResultsData
from app.services.pdf_report_service import PdfReportService


def _team(tid: int, name: str, photo_url: str = ""):
    return SimpleNamespace(id=tid, name=name, versus_group_id=None, photo_url=photo_url)


def _cp(cid: int, order: int, name: str = "CP"):
    return SimpleNamespace(id=cid, order=order, event_id=1, name=name)


def _result(team_id: int, checkpoint_id: int, *, final_score=6.0, media_urls=None, **kw):
    return SimpleNamespace(
        team_id=team_id,
        activity=SimpleNamespace(
            checkpoint=SimpleNamespace(id=checkpoint_id), config=kw.get("config", {})
        ),
        is_completed=kw.get("is_completed", True),
        final_score=final_score,
        extra_shots=kw.get("extra_shots", 0),
        penalties=kw.get("penalties", {}),
        penalty_counts=kw.get("penalty_counts", {}),
        bonuses=kw.get("bonuses", {}),
        bonus_counts=kw.get("bonus_counts", {}),
        result_data=kw.get("result_data", {}),
        media_urls=media_urls or [],
        judgment_status=kw.get("judgment_status"),
        team_vs_result=kw.get("team_vs_result"),
    )


def _event(name="Test Event", start=None, end=None, event_type="rally_tascas"):
    return SimpleNamespace(id=1, name=name, start_time=start, end_time=end, event_type=event_type)


def _data(**kwargs) -> EventResultsData:
    kwargs.setdefault("teams", [])
    kwargs.setdefault("checkpoints", [])
    kwargs.setdefault("results", [])
    return EventResultsData(**kwargs)


def _service() -> PdfReportService:
    from reportlab.lib.styles import getSampleStyleSheet

    svc = PdfReportService.__new__(PdfReportService)
    svc._styles = getSampleStyleSheet()
    svc.db = None
    return svc


def _service_for(data: EventResultsData) -> PdfReportService:
    svc = _service()

    class _StubQuery:
        async def load(self, _event_id):
            return data

    svc._query = _StubQuery()
    return svc


async def _build(data: EventResultsData) -> bytes:
    return await _service_for(data).build_report(1)


def _headings(flowables) -> list[str]:
    return [f.getPlainText() for f in flowables if isinstance(f, Paragraph)]


class TestBuildReport:
    async def test_produces_a_valid_pdf(self):
        data = _data(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)], event=_event())
        content = await _build(data)
        assert content.startswith(b"%PDF")
        assert len(content) > 500

    async def test_empty_event_still_produces_a_pdf(self):
        content = await _build(_data(event=_event()))
        assert content.startswith(b"%PDF")

    async def test_missing_event_falls_back_to_placeholder_title(self):
        content = await _build(_data(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)]))
        assert content.startswith(b"%PDF")


class TestRankingSection:
    def test_absent_when_there_are_no_teams(self):
        assert _service()._ranking_section(_data()) == []

    def test_flags_a_provisional_ranking_when_results_are_unjudged(self):
        data = _data(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1)],
            results=[_result(1, 10, final_score=None, judgment_status="pending_judgment")],
        )
        text = " ".join(_headings(_service()._ranking_section(data)))
        assert "provisória" in text

    def test_no_provisional_note_when_everything_is_scored(self):
        data = _data(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)], results=[_result(1, 10)])
        text = " ".join(_headings(_service()._ranking_section(data)))
        assert "provisória" not in text


class TestCheckpointsSection:
    def test_absent_when_no_checkpoint_was_reached(self):
        data = _data(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)])
        assert _service()._checkpoints_section(data) == []

    def test_omits_a_checkpoint_nobody_reached(self):
        data = _data(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1, "Usado"), _cp(11, 2, "Vazio")],
            results=[_result(1, 10)],
        )
        headings = _headings(_service()._checkpoints_section(data))
        assert any("Usado" in h for h in headings)
        assert not any("Vazio" in h for h in headings)


class TestHintsAndSkipsSection:
    def test_absent_when_neither_happened(self):
        assert _service()._hints_and_skips_section(_data()) == []

    def test_present_when_a_hint_was_revealed(self):
        hint = SimpleNamespace(
            team_id=1, checkpoint_id=10, revealed_at=datetime(2026, 5, 1, 10, 0), cost=-10
        )
        data = _data(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)], hint_reveals=[hint])
        headings = _headings(_service()._hints_and_skips_section(data))
        assert "Pistas e Desistências" in headings
        assert "Pistas reveladas" in headings
        assert "Postos desistidos" not in headings


class TestAwardsSection:
    def test_absent_when_only_automatic_overflow_carries_exist(self):
        automatic = SimpleNamespace(
            team_id=1,
            points=-4.0,
            reason="Excesso",
            awarded_at=datetime(2026, 5, 1),
            activity_result_id=99,
            is_active=True,
        )
        data = _data(teams=[_team(1, "A")], awards=[automatic])
        assert _service()._awards_section(data) == []

    def test_present_for_an_admin_adjustment(self):
        manual = SimpleNamespace(
            team_id=1,
            points=15.0,
            reason="Criatividade",
            awarded_at=datetime(2026, 5, 1),
            activity_result_id=None,
            is_active=True,
        )
        data = _data(teams=[_team(1, "A")], awards=[manual])
        assert "Ajustes Manuais" in _headings(_service()._awards_section(data))


class TestBadgesSection:
    def test_absent_when_no_badges_were_awarded(self):
        assert _service()._badges_section(_data()) == []

    def test_present_when_badges_exist(self):
        badge = SimpleNamespace(
            team_id=1,
            badge_type="head_to_head_win",
            checkpoint_id=10,
            awarded_at=datetime(2026, 5, 1),
        )
        data = _data(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)], badges=[badge])
        assert "Medalhas" in _headings(_service()._badges_section(data))


class TestStatsSection:
    def test_breaks_penalties_down_per_counter_instead_of_one_total(self):
        rule = SimpleNamespace(id=7, name="Atraso", rule_type="penalty_counter", points=5.0)
        data = _data(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1)],
            results=[_result(1, 10, penalty_counts={"g_7": 3})],
            rules=[rule],
        )
        table = _service()._stats_section(data)[1]
        labels = [row[0] for row in table._cellvalues]
        assert "Atraso (penalização)" in labels

    def test_omits_duration_when_the_event_has_no_recorded_times(self):
        data = _data(teams=[_team(1, "A")], event=_event())
        table = _service()._stats_section(data)[1]
        labels = [row[0] for row in table._cellvalues]
        assert "Duração do evento" not in labels

    def test_includes_duration_when_both_times_are_recorded(self):
        event = _event(start=datetime(2026, 5, 1, 9, 0), end=datetime(2026, 5, 1, 17, 0))
        data = _data(teams=[_team(1, "A")], event=event)
        table = _service()._stats_section(data)[1]
        labels = [row[0] for row in table._cellvalues]
        assert "Duração do evento" in labels

    def test_omits_best_worst_checkpoint_with_only_one_scored_post(self):
        data = _data(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)], results=[_result(1, 10)])
        table = _service()._stats_section(data)[1]
        labels = [row[0] for row in table._cellvalues]
        assert "Posto com maior pontuação média" not in labels


class TestPhotosSection:
    async def test_absent_when_the_event_has_no_photos(self):
        data = _data(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)], results=[_result(1, 10)])
        assert await _service()._photos_section(data) == []

    async def test_absent_when_every_photo_fails_to_download(self):
        data = _data(teams=[_team(1, "A", photo_url="https://x/a.png")])
        with patch(
            "app.services.pdf_report_service.PdfReportService._download_image",
            return_value=None,
        ):
            assert await _service()._photos_section(data) == []


class TestPhotoUrls:
    def test_includes_team_photos(self):
        data = _data(teams=[_team(1, "A", photo_url="https://x/a.png")])
        assert ("Equipa: A", "https://x/a.png") in PdfReportService._photo_urls(data)

    def test_skips_teams_without_a_photo(self):
        data = _data(teams=[_team(1, "A", photo_url="")])
        assert PdfReportService._photo_urls(data) == []

    def test_capture_photos_are_captioned_with_the_team_name(self):
        data = _data(
            teams=[_team(1, "A")],
            results=[_result(1, 10, media_urls=["https://x/capture1.png"])],
        )
        assert ("Captura: A", "https://x/capture1.png") in PdfReportService._photo_urls(data)

    def test_caps_at_max_photos(self):
        results = [_result(1, 10, media_urls=[f"https://x/{i}.png"]) for i in range(50)]
        data = _data(teams=[_team(1, "A")], results=results)
        assert len(PdfReportService._photo_urls(data)) <= 24


class TestDownloadImage:
    def test_returns_none_on_request_failure(self):
        import requests

        with (
            patch(
                "app.services.pdf_report_service.PdfReportService._is_safe_photo_url",
                return_value=True,
            ),
            patch(
                "app.services.pdf_report_service.requests.get",
                side_effect=requests.exceptions.ConnectionError("boom"),
            ),
        ):
            assert PdfReportService._download_image("https://x/broken.png") is None

    def test_returns_none_and_never_fetches_a_url_outside_the_allowed_bucket(self):
        with patch("app.services.pdf_report_service.requests.get") as mock_get:
            assert PdfReportService._download_image("https://evil.example/pwn.png") is None
            mock_get.assert_not_called()


class TestIsSafePhotoUrl:
    def test_rejects_url_when_no_public_base_configured(self):
        with patch("app.services.pdf_report_service.settings.R2_PUBLIC_BASE_URL", None):
            assert PdfReportService._is_safe_photo_url("https://x/a.png") is False

    def test_rejects_url_on_a_different_host(self):
        with patch(
            "app.services.pdf_report_service.settings.R2_PUBLIC_BASE_URL",
            "https://pub-abc123.r2.dev",
        ):
            assert PdfReportService._is_safe_photo_url("https://attacker.example/a.png") is False

    def test_rejects_non_https_scheme(self):
        with patch(
            "app.services.pdf_report_service.settings.R2_PUBLIC_BASE_URL",
            "https://pub-abc123.r2.dev",
        ):
            assert PdfReportService._is_safe_photo_url("http://pub-abc123.r2.dev/a.png") is False

    def test_rejects_hostname_resolving_to_a_private_address(self):
        with (
            patch(
                "app.services.pdf_report_service.settings.R2_PUBLIC_BASE_URL",
                "https://internal.example",
            ),
            patch(
                "app.services.pdf_report_service.socket.getaddrinfo",
                return_value=[(2, 1, 6, "", ("127.0.0.1", 0))],
            ),
        ):
            assert PdfReportService._is_safe_photo_url("https://internal.example/a.png") is False

    def test_accepts_url_matching_the_configured_bucket_host(self):
        with (
            patch(
                "app.services.pdf_report_service.settings.R2_PUBLIC_BASE_URL",
                "https://pub-abc123.r2.dev",
            ),
            patch(
                "app.services.pdf_report_service.socket.getaddrinfo",
                return_value=[(2, 1, 6, "", ("8.8.8.8", 0))],
            ),
        ):
            assert PdfReportService._is_safe_photo_url("https://pub-abc123.r2.dev/a.png") is True

    def test_rejects_url_whose_hostname_fails_to_resolve(self):
        with (
            patch(
                "app.services.pdf_report_service.settings.R2_PUBLIC_BASE_URL",
                "https://pub-abc123.r2.dev",
            ),
            patch(
                "app.services.pdf_report_service.socket.getaddrinfo",
                side_effect=OSError("no such host"),
            ),
        ):
            assert PdfReportService._is_safe_photo_url("https://pub-abc123.r2.dev/a.png") is False
