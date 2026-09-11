"""Unit tests for the event-dossier PDF.

`build_report` is asserted only at the byte level (starts with the %PDF magic,
non-trivially sized) — reportlab's layout is trusted. What each section
decides to emit is asserted against the section builders directly, since that
is our logic, and "this section is absent" is most of what these tests are
for.
"""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from reportlab.platypus import Paragraph

from app.services.event_report_context import (
    EventAuditTrail,
    EventContent,
    EventReportContext,
    EventRoster,
)
from app.services.event_results_query import EventResultsData
from app.services.pdf_report_service import PdfReportService
from app.services.report import photos, sections_people, sections_route, sections_scores
from app.services.report import sections_trails as trails


def _team(tid: int, name: str, photo_url: str = "", total: float = 0.0):
    return SimpleNamespace(
        id=tid, name=name, versus_group_id=None, photo_url=photo_url, total=total
    )


def _cp(cid: int, order: int, name: str = "CP", **kw):
    return SimpleNamespace(
        id=cid,
        order=order,
        name=name,
        event_id=1,
        description=kw.get("description", ""),
        clue=kw.get("clue", ""),
        staff_script=kw.get("staff_script", ""),
        challenge_brief=kw.get("challenge_brief", ""),
        latitude=None,
        longitude=None,
        arrival_radius_m=50,
        available_from=None,
        available_until=None,
        is_draft=False,
        is_placeholder=False,
        stage_id=kw.get("stage_id"),
    )


def _result(team_id: int, checkpoint_id: int, *, final_score=6.0, media_urls=None, **kw):
    return SimpleNamespace(
        id=kw.get("rid", 1),
        team_id=team_id,
        activity=SimpleNamespace(
            checkpoint=SimpleNamespace(id=checkpoint_id),
            config=kw.get("config", {}),
            name="Prova",
            activity_type="ScoreBasedActivity",
        ),
        is_completed=kw.get("is_completed", True),
        final_score=final_score,
        extra_shots=kw.get("extra_shots", 0),
        penalties=kw.get("penalties", {}),
        penalty_counts=kw.get("penalty_counts", {}),
        bonuses={},
        bonus_counts=kw.get("bonus_counts", {}),
        result_data=kw.get("result_data", {}),
        media_urls=media_urls or [],
        judgment_status=kw.get("judgment_status"),
        team_vs_result=kw.get("team_vs_result"),
        completed_at=None,
    )


def _event(name="Test Event", start=None, end=None, event_type="rally_tascas"):
    return SimpleNamespace(
        id=1, name=name, slug="test", start_time=start, end_time=end, event_type=event_type
    )


def _ctx(*, roster=None, content=None, audit=None, **kwargs) -> EventReportContext:
    kwargs.setdefault("teams", [])
    kwargs.setdefault("checkpoints", [])
    kwargs.setdefault("results", [])
    return EventReportContext(
        results=EventResultsData(**kwargs),
        roster=roster or EventRoster(),
        content=content or EventContent(),
        audit=audit or EventAuditTrail(),
    )


async def _build(ctx: EventReportContext) -> bytes:
    svc = PdfReportService.__new__(PdfReportService)

    class _StubQuery:
        async def load(self, _event_id):
            return ctx

    svc.db = None
    svc._query = _StubQuery()
    return await svc.build_report(1)


def _tables(flowables) -> list:
    """Every Table in a section, reaching inside KeepTogether wrappers."""
    out = []
    for flowable in flowables:
        if hasattr(flowable, "_cellvalues"):
            out.append(flowable)
        for child in getattr(flowable, "_content", []) or []:
            if hasattr(child, "_cellvalues"):
                out.append(child)
    return out


def _cells(flowables) -> str:
    """Every table cell in a section, flattened for a substring check."""
    return str([t._cellvalues for t in _tables(flowables)])


def _headings(flowables) -> list[str]:
    out = []
    for flowable in flowables:
        if isinstance(flowable, Paragraph):
            out.append(flowable.getPlainText())
        for child in getattr(flowable, "_content", []) or []:
            if isinstance(child, Paragraph):
                out.append(child.getPlainText())
    return out


class TestBuildReport:
    async def test_produces_a_valid_pdf(self):
        ctx = _ctx(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)], event=_event())
        content = await _build(ctx)
        assert content.startswith(b"%PDF")
        assert len(content) > 500

    async def test_empty_event_still_produces_a_pdf(self):
        assert (await _build(_ctx(event=_event()))).startswith(b"%PDF")

    async def test_missing_event_falls_back_to_placeholder_title(self):
        ctx = _ctx(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)])
        assert (await _build(ctx)).startswith(b"%PDF")

    async def test_a_rich_event_renders_every_section(self):
        ctx = _rich_context()
        content = await _build(ctx)
        assert content.startswith(b"%PDF")
        # Far more than the bare ranking-only document.
        assert len(content) > 5000


class TestRanking:
    def test_absent_when_there_are_no_teams(self):
        assert sections_scores.ranking(_ctx()) == []

    def test_ranks_by_the_recorded_total_not_the_checkpoint_sum(self):
        """A team whose hints cost it the lead must not be ranked first."""
        ctx = _ctx(
            teams=[_team(1, "Gastou", total=-4.0), _team(2, "Poupou", total=5.0)],
            checkpoints=[_cp(10, 1)],
            results=[_result(1, 10, final_score=6.0), _result(2, 10, final_score=5.0, rid=2)],
            hint_reveals=[
                SimpleNamespace(
                    team_id=1,
                    checkpoint_id=10,
                    indication_id=1,
                    revealed_at=datetime(2026, 5, 1),
                    cost=-10,
                )
            ],
        )
        assert [t.name for t in ctx.ranked_teams()] == ["Poupou", "Gastou"]

    def test_flags_a_provisional_ranking_when_results_are_unjudged(self):
        ctx = _ctx(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1)],
            results=[_result(1, 10, final_score=None, judgment_status="pending_judgment")],
        )
        assert "provisória" in " ".join(_headings(sections_scores.ranking(ctx)))

    def test_no_provisional_note_when_everything_is_scored(self):
        ctx = _ctx(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)], results=[_result(1, 10)])
        assert "provisória" not in " ".join(_headings(sections_scores.ranking(ctx)))


class TestEventRecord:
    def test_warns_when_the_totals_do_not_reconcile(self):
        ctx = _ctx(
            teams=[_team(1, "A", total=99.0)],
            checkpoints=[_cp(10, 1)],
            results=[_result(1, 10, final_score=6.0)],
            event=_event(),
        )
        labels = [row[0] for row in sections_scores.event_record(ctx)[1]._cellvalues]
        assert "Aviso" in labels

    def test_no_warning_when_they_agree(self):
        ctx = _ctx(
            teams=[_team(1, "A", total=6.0)],
            checkpoints=[_cp(10, 1)],
            results=[_result(1, 10, final_score=6.0)],
            event=_event(),
        )
        labels = [row[0] for row in sections_scores.event_record(ctx)[1]._cellvalues]
        assert "Aviso" not in labels


class TestCheckpointDetail:
    def test_absent_when_no_checkpoint_was_reached(self):
        ctx = _ctx(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)])
        assert sections_scores.checkpoint_detail(ctx) == []

    def test_omits_a_checkpoint_nobody_reached(self):
        ctx = _ctx(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1, "Usado"), _cp(11, 2, "Vazio")],
            results=[_result(1, 10)],
        )
        headings = _headings(sections_scores.checkpoint_detail(ctx))
        assert any("Usado" in h for h in headings)
        assert not any("Vazio" in h for h in headings)


class TestRouteDossier:
    def test_absent_when_there_are_no_checkpoints(self):
        assert sections_route.route_dossier(_ctx()) == []

    def test_carries_the_staff_only_briefing_and_challenge(self):
        cp = _cp(10, 1, "Bar", staff_script="Explicar as regras", challenge_brief="Três shots")
        ctx = _ctx(teams=[_team(1, "A")], checkpoints=[cp], results=[_result(1, 10)])
        cells = _cells(sections_route.route_dossier(ctx))
        assert "Guião do staff" in cells
        assert "Desafio" in cells
        assert "Explicar as regras" in cells

    def test_hint_ladder_shows_the_expected_answer(self):
        indication = SimpleNamespace(
            id=1,
            checkpoint_id=10,
            order=0,
            hint="Perto do rio",
            question="Que rio?",
            expected_answer="Vouga",
        )
        ctx = _ctx(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1, "Bar")],
            results=[_result(1, 10)],
            content=EventContent(indications=[indication]),
        )
        assert "Vouga" in _cells(sections_route.route_dossier(ctx))


class TestPeopleSections:
    def test_all_absent_when_nobody_was_recorded(self):
        ctx = _ctx(teams=[], checkpoints=[_cp(10, 1)])
        assert sections_people.teams_and_members(ctx) == []
        assert sections_people.staff(ctx) == []
        assert sections_people.guides(ctx) == []
        assert sections_people.progress(ctx) == []

    def test_team_section_lists_members_with_their_identity(self):
        member = SimpleNamespace(
            id=7,
            name="Ana",
            email="ana@example.org",
            team_id=1,
            is_captain=True,
            authentik_sub="sub-1",
            disabled=False,
            scopes=None,
        )
        ctx = _ctx(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1)],
            roster=EventRoster(members=[member]),
        )
        section = sections_people.teams_and_members(ctx)
        assert "Equipas" in _headings(section)
        cells = _cells(section)
        assert "Ana" in cells
        assert "ana@example.org" in cells

    def test_staff_section_appears_once_somebody_is_assigned(self):
        user = SimpleNamespace(
            id=42,
            name="Ana",
            email="ana@example.org",
            scopes=[],
            disabled=False,
            authentik_sub="sub-1",
            team_id=None,
            is_captain=False,
        )
        ctx = _ctx(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1, "Bar")],
            roster=EventRoster(
                staff_assignments=[SimpleNamespace(id=1, user_id=42, checkpoint_id=10)],
                staff_users=[user],
            ),
        )
        assert "Staff por Posto" in _headings(sections_people.staff(ctx))

    def test_progress_uses_arrival_rows_rather_than_the_positional_array(self):
        arrival = SimpleNamespace(
            team_id=1, checkpoint_id=11, arrived_at=datetime(2026, 5, 1, 10, 0)
        )
        ctx = _ctx(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1, "Um"), _cp(11, 2, "Dois")],
            results=[_result(1, 10)],
            arrivals=[arrival],
        )
        assert "Progresso das Equipas" in _headings(sections_people.progress(ctx))


class TestTrailSections:
    def test_all_absent_on_an_event_that_used_none_of_them(self):
        ctx = _ctx(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)], results=[_result(1, 10)])
        assert trails.hints_and_skips(ctx) == []
        assert trails.manual_awards(ctx) == []
        assert trails.badges(ctx) == []
        assert trails.evaluation_log(ctx) == []
        assert trails.audit_log(ctx) == []

    def test_manual_awards_exclude_automatic_overflow_carries(self):
        automatic = SimpleNamespace(
            team_id=1,
            points=-4.0,
            reason="Excesso",
            awarded_at=datetime(2026, 5, 1),
            activity_result_id=99,
            is_active=True,
        )
        ctx = _ctx(teams=[_team(1, "A")], awards=[automatic])
        assert trails.manual_awards(ctx) == []

    def test_evaluation_log_writes_one_row_per_changed_field(self):
        result = _result(1, 10, rid=55)
        history = SimpleNamespace(
            id=1,
            result_id=55,
            action="updated",
            editor_id="sub-1",
            editor_name="Ana",
            changes={
                "final_score": {"before": 6, "after": 9},
                "extra_shots": {"before": 0, "after": 2},
            },
            note=None,
            created_at=datetime(2026, 5, 1, 12, 0),
        )
        ctx = _ctx(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1, "Bar")],
            results=[result],
            audit=EventAuditTrail(evaluations=[history], result_by_id={55: result}),
        )
        table = trails.evaluation_log(ctx)[1]
        assert len(table._cellvalues) == 3  # header + one row per changed field

    def test_contest_with_no_diff_still_carries_its_reason(self):
        result = _result(1, 10, rid=55)
        contest = SimpleNamespace(
            id=2,
            result_id=55,
            action="contested",
            editor_id="1",
            editor_name="A",
            changes={},
            note="Não concordamos",
            created_at=datetime(2026, 5, 1, 13, 0),
        )
        ctx = _ctx(
            teams=[_team(1, "A")],
            checkpoints=[_cp(10, 1, "Bar")],
            results=[result],
            audit=EventAuditTrail(evaluations=[contest], result_by_id={55: result}),
        )
        table = trails.evaluation_log(ctx)[1]
        assert len(table._cellvalues) == 2


class TestLongTextWrapping:
    def test_prose_is_wrapped_in_a_paragraph_so_it_cannot_overflow(self):
        from app.services.report.tables import cell

        long_text = "x" * 200
        assert isinstance(cell(long_text), Paragraph)
        assert not isinstance(cell("short"), Paragraph)

    def test_markup_in_free_text_is_escaped_rather_than_parsed(self):
        from app.services.report.tables import cell

        rendered = cell("<b>não</b> é markup " + "y" * 60)
        assert "&lt;b&gt;" in rendered.text


class TestPhotosSection:
    async def test_absent_when_the_event_has_no_photos(self):
        ctx = _ctx(teams=[_team(1, "A")], checkpoints=[_cp(10, 1)], results=[_result(1, 10)])
        assert await photos.photos_section(ctx) == []

    async def test_absent_when_every_photo_fails_to_download(self):
        ctx = _ctx(teams=[_team(1, "A", photo_url="https://x/a.png")])
        with patch("app.services.report.photos.download_image", return_value=None):
            assert await photos.photos_section(ctx) == []


class TestPhotoUrls:
    def test_includes_team_photos(self):
        ctx = _ctx(teams=[_team(1, "A", photo_url="https://x/a.png")])
        assert ("Equipa: A", "https://x/a.png") in photos.photo_urls(ctx)

    def test_skips_teams_without_a_photo(self):
        assert photos.photo_urls(_ctx(teams=[_team(1, "A", photo_url="")])) == []

    def test_capture_photos_are_captioned_with_the_team_name(self):
        ctx = _ctx(
            teams=[_team(1, "A")],
            results=[_result(1, 10, media_urls=["https://x/capture1.png"])],
        )
        assert ("Captura: A", "https://x/capture1.png") in photos.photo_urls(ctx)

    def test_caps_at_max_photos(self):
        results = [_result(1, 10, media_urls=[f"https://x/{i}.png"]) for i in range(50)]
        ctx = _ctx(teams=[_team(1, "A")], results=results)
        assert len(photos.photo_urls(ctx)) <= 24


class TestDownloadImage:
    def test_returns_none_on_request_failure(self):
        import requests

        with (
            patch("app.services.report.photos.is_safe_photo_url", return_value=True),
            patch(
                "app.services.report.photos.requests.get",
                side_effect=requests.exceptions.ConnectionError("boom"),
            ),
        ):
            assert photos.download_image("https://x/broken.png") is None

    def test_returns_none_and_never_fetches_a_url_outside_the_allowed_bucket(self):
        with patch("app.services.report.photos.requests.get") as mock_get:
            assert photos.download_image("https://evil.example/pwn.png") is None
            mock_get.assert_not_called()


class TestIsSafePhotoUrl:
    def test_rejects_url_when_no_public_base_configured(self):
        with patch("app.services.report.photos.settings.R2_PUBLIC_BASE_URL", None):
            assert photos.is_safe_photo_url("https://x/a.png") is False

    def test_rejects_url_on_a_different_host(self):
        with patch(
            "app.services.report.photos.settings.R2_PUBLIC_BASE_URL", "https://pub-abc123.r2.dev"
        ):
            assert photos.is_safe_photo_url("https://attacker.example/a.png") is False

    def test_rejects_non_https_scheme(self):
        with patch(
            "app.services.report.photos.settings.R2_PUBLIC_BASE_URL", "https://pub-abc123.r2.dev"
        ):
            assert photos.is_safe_photo_url("http://pub-abc123.r2.dev/a.png") is False

    def test_rejects_hostname_resolving_to_a_private_address(self):
        with (
            patch(
                "app.services.report.photos.settings.R2_PUBLIC_BASE_URL",
                "https://internal.example",
            ),
            patch(
                "app.services.report.photos.socket.getaddrinfo",
                return_value=[(2, 1, 6, "", ("127.0.0.1", 0))],
            ),
        ):
            assert photos.is_safe_photo_url("https://internal.example/a.png") is False

    def test_accepts_url_matching_the_configured_bucket_host(self):
        with (
            patch(
                "app.services.report.photos.settings.R2_PUBLIC_BASE_URL",
                "https://pub-abc123.r2.dev",
            ),
            patch(
                "app.services.report.photos.socket.getaddrinfo",
                return_value=[(2, 1, 6, "", ("8.8.8.8", 0))],
            ),
        ):
            assert photos.is_safe_photo_url("https://pub-abc123.r2.dev/a.png") is True

    def test_rejects_url_whose_hostname_fails_to_resolve(self):
        with (
            patch(
                "app.services.report.photos.settings.R2_PUBLIC_BASE_URL",
                "https://pub-abc123.r2.dev",
            ),
            patch(
                "app.services.report.photos.socket.getaddrinfo",
                side_effect=OSError("no such host"),
            ),
        ):
            assert photos.is_safe_photo_url("https://pub-abc123.r2.dev/a.png") is False


def _rich_context() -> EventReportContext:
    """An event that used most of the platform, for the end-to-end render."""
    result = _result(1, 10, final_score=8.0, penalty_counts={"vomit": 1}, rid=55)
    member = SimpleNamespace(
        id=7,
        name="Ana",
        email="ana@example.org",
        team_id=1,
        is_captain=True,
        authentik_sub="sub-1",
        disabled=False,
        scopes=None,
    )
    staff_user = SimpleNamespace(
        id=42,
        name="Rui",
        email="rui@example.org",
        scopes=["staff"],
        disabled=False,
        authentik_sub="sub-2",
        team_id=None,
        is_captain=False,
    )
    activity = SimpleNamespace(
        id=1,
        name="Prova",
        activity_type="ScoreBasedActivity",
        checkpoint_id=10,
        config={"max_points": 100},
        is_global=False,
        is_active=True,
        available_from=None,
        available_until=None,
        description="",
    )
    indication = SimpleNamespace(
        id=1,
        checkpoint_id=10,
        order=0,
        hint="Perto do rio",
        question="Que rio?",
        expected_answer="Vouga",
    )
    history = SimpleNamespace(
        id=1,
        result_id=55,
        action="updated",
        editor_id="sub-2",
        editor_name="Rui",
        changes={"final_score": {"before": 6, "after": 8}},
        note=None,
        created_at=datetime(2026, 5, 1, 12, 0),
    )
    audit_entry = SimpleNamespace(
        id=1,
        event_id=1,
        actor_id="sub-2",
        actor_name="Rui",
        actor_kind="staff",
        action="rally_settings.updated",
        target_type="rally_settings",
        target_id="1",
        changes={"hints_enabled": {"before": True, "after": False}},
        note=None,
        request_id="req-1",
        created_at=datetime(2026, 5, 1, 9, 0),
    )
    return _ctx(
        teams=[_team(1, "A", total=8.0)],
        checkpoints=[_cp(10, 1, "Bar", staff_script="Explicar", challenge_brief="Três shots")],
        results=[result],
        event=_event(start=datetime(2026, 5, 1, 9), end=datetime(2026, 5, 1, 17)),
        arrivals=[
            SimpleNamespace(team_id=1, checkpoint_id=10, arrived_at=datetime(2026, 5, 1, 10))
        ],
        hint_reveals=[
            SimpleNamespace(
                team_id=1,
                checkpoint_id=10,
                indication_id=1,
                revealed_at=datetime(2026, 5, 1, 10),
                cost=-10,
            )
        ],
        badges=[
            SimpleNamespace(
                team_id=1,
                badge_type="head_to_head_win",
                checkpoint_id=10,
                awarded_at=datetime(2026, 5, 1),
            )
        ],
        roster=EventRoster(
            staff_assignments=[SimpleNamespace(id=1, user_id=42, checkpoint_id=10)],
            guide_assignments=[SimpleNamespace(id=1, user_id=42, team_id=1)],
            members=[member],
            staff_users=[staff_user],
        ),
        content=EventContent(activities=[activity], indications=[indication]),
        audit=EventAuditTrail(
            evaluations=[history], audit_log=[audit_entry], result_by_id={55: result}
        ),
    )
