"""Unit tests for ExportService workbook construction.

These exercise the layout/aggregation logic in isolation: the DB read is
stubbed by replacing the service's `EventResultsQuery` with one that returns a
pre-built `EventResultsData`, so no database is needed, and the resulting
workbook is parsed back with openpyxl.

Most of what is asserted here is *absence*: a column or sheet for a mechanic
the event never used must not appear at all.
"""

from datetime import datetime
from io import BytesIO
from types import SimpleNamespace

import openpyxl
import pytest

from app.services.event_results_query import EventResultsData
from app.services.export_service import ExportService


def _team(tid: int, name: str, group: int | None = None, photo_url: str = ""):
    return SimpleNamespace(id=tid, name=name, versus_group_id=group, photo_url=photo_url)


def _cp(cid: int, order: int, name: str | None = None):
    return SimpleNamespace(id=cid, order=order, event_id=1, name=name or f"Posto {order}")


def _result(
    team_id: int,
    checkpoint_id: int,
    *,
    final_score: float = 6.0,
    extra_shots: int = 0,
    penalties: dict | None = None,
    penalty_counts: dict | None = None,
    bonuses: dict | None = None,
    bonus_counts: dict | None = None,
    notes: str = "",
    completed: bool = True,
    judgment_status: str | None = None,
    config: dict | None = None,
    team_vs_result: str | None = None,
):
    return SimpleNamespace(
        team_id=team_id,
        activity=SimpleNamespace(checkpoint=SimpleNamespace(id=checkpoint_id), config=config or {}),
        is_completed=completed,
        final_score=final_score,
        extra_shots=extra_shots,
        penalties=penalties or {},
        penalty_counts=penalty_counts or {},
        bonuses=bonuses or {},
        bonus_counts=bonus_counts or {},
        result_data={"notes": notes} if notes else {},
        media_urls=[],
        judgment_status=judgment_status,
        team_vs_result=team_vs_result,
    )


def _service(**kwargs) -> ExportService:
    svc = ExportService.__new__(ExportService)
    data = EventResultsData(**kwargs)

    class _StubQuery:
        async def load(self, _event_id):
            return data

    svc.db = None
    svc._query = _StubQuery()
    return svc


async def _build(teams, checkpoints, results, **extra):
    raw = await _service(
        teams=teams, checkpoints=checkpoints, results=results, **extra
    ).build_workbook(1)
    return openpyxl.load_workbook(BytesIO(raw))


def _rows(ws):
    return list(ws.iter_rows(values_only=True))


@pytest.mark.asyncio
async def test_sheets_are_named_after_the_checkpoints_that_were_used():
    wb = await _build(
        [_team(1, "A")],
        [_cp(10, 1, "Bar do Zé"), _cp(11, 2, "Praça")],
        [_result(1, 10), _result(1, 11)],
    )
    assert wb.sheetnames == ["Overall", "1. Bar do Zé", "2. Praça"]


@pytest.mark.asyncio
async def test_checkpoint_nobody_reached_gets_no_sheet_and_no_column():
    wb = await _build(
        [_team(1, "A")],
        [_cp(10, 1, "Usado"), _cp(11, 2, "Nunca aconteceu")],
        [_result(1, 10)],
    )
    assert wb.sheetnames == ["Overall", "1. Usado"]
    assert _rows(wb["Overall"])[0] == ("Team", "1. Usado", "Total Points")


@pytest.mark.asyncio
async def test_overall_headers_and_totals():
    teams = [_team(1, "A", 5), _team(2, "B", 5)]
    cps = [_cp(10, 1, "Um"), _cp(11, 2, "Dois")]
    results = [
        _result(1, 10, final_score=6.0),
        _result(1, 11, final_score=3.0),
        _result(2, 10, final_score=4.0),
    ]
    wb = await _build(teams, cps, results)
    rows = _rows(wb["Overall"])

    assert rows[0] == ("Team", "Versus Pair", "1. Um", "2. Dois", "Total Points")
    assert rows[1] == ("A", "B", 6, 3, 9)
    # Team B never reached checkpoint 2: blank, not a zero it did not earn.
    assert rows[2] == ("B", "A", 4, None, 4)


@pytest.mark.asyncio
async def test_versus_column_absent_when_no_team_had_an_opponent():
    wb = await _build([_team(1, "Solo")], [_cp(10, 1, "Um")], [_result(1, 10)])
    assert _rows(wb["Overall"])[0] == ("Team", "1. Um", "Total Points")


@pytest.mark.asyncio
async def test_incomplete_result_excluded_from_score_but_counts_as_attendance():
    teams = [_team(1, "A")]
    cps = [_cp(10, 1, "Um")]
    results = [_result(1, 10, final_score=9.0, completed=False)]
    wb = await _build(teams, cps, results)

    # Present at the checkpoint, so a real 0 rather than a blank.
    assert _rows(wb["Overall"])[1] == ("A", 0, 0)


@pytest.mark.asyncio
async def test_checkpoint_sheet_shows_only_the_counters_that_were_recorded():
    teams = [_team(1, "A", 5), _team(2, "B", 5)]
    cps = [_cp(10, 1, "Um")]
    results = [
        _result(
            1,
            10,
            final_score=6.0,
            extra_shots=5,
            penalty_counts={"vomit": 2},
            notes="Objeto: pasta",
            team_vs_result="win",
        ),
        _result(2, 10, final_score=4.0, team_vs_result="loss"),
    ]
    wb = await _build(teams, cps, results)
    rows = _rows(wb["1. Um"])

    assert rows[0] == (
        "Team",
        "Versus Pair",
        "Match Result",
        "Extra Shots",
        "Vómitos (-)",
        "Notes",
        "Total Checkpoint",
    )
    assert "Not drinking penalty (-)" not in rows[0]
    assert rows[1] == ("A", "B", "win", 5, 2, "Objeto: pasta", 6)
    assert rows[2] == ("B", "A", "loss", 0, 0, None, 4)


@pytest.mark.asyncio
async def test_peddy_paper_event_has_no_drinking_columns():
    """No extra shots, no vomit, no not_drinking recorded -> none shown."""
    wb = await _build(
        [_team(1, "A")],
        [_cp(10, 1, "Um")],
        [_result(1, 10, final_score=5.0)],
    )
    assert _rows(wb["1. Um"])[0] == ("Team", "Total Checkpoint")


@pytest.mark.asyncio
async def test_custom_activity_counter_becomes_its_own_labelled_column():
    config = {"penalty_counters": [{"key": "asneira", "label": "Asneiras", "points": 3}]}
    wb = await _build(
        [_team(1, "A")],
        [_cp(10, 1, "Um")],
        [_result(1, 10, penalty_counts={"asneira": 4}, config=config)],
    )
    rows = _rows(wb["1. Um"])
    assert rows[0] == ("Team", "Asneiras (-3)", "Total Checkpoint")
    assert rows[1] == ("A", 4, 6)


@pytest.mark.asyncio
async def test_global_rule_column_is_labelled_with_the_rule_name():
    rule = SimpleNamespace(id=7, name="Atraso", rule_type="penalty_counter", points=5.0)
    wb = await _build(
        [_team(1, "A")],
        [_cp(10, 1, "Um")],
        [_result(1, 10, penalty_counts={"g_7": 1})],
        rules=[rule],
    )
    assert _rows(wb["1. Um"])[0] == ("Team", "Atraso (-5)", "Total Checkpoint")


@pytest.mark.asyncio
async def test_bonus_counter_is_shown():
    rule = SimpleNamespace(id=3, name="Criatividade", rule_type="bonus_counter", points=2.0)
    wb = await _build(
        [_team(1, "A")],
        [_cp(10, 1, "Um")],
        [_result(1, 10, bonus_counts={"gb_3": 2})],
        rules=[rule],
    )
    rows = _rows(wb["1. Um"])
    assert rows[0] == ("Team", "Criatividade (+2)", "Total Checkpoint")
    assert rows[1] == ("A", 2, 6)


@pytest.mark.asyncio
async def test_pending_judgment_is_labelled_rather_than_scored_as_zero():
    wb = await _build(
        [_team(1, "A")],
        [_cp(10, 1, "Um")],
        [_result(1, 10, final_score=None, judgment_status="pending_judgment")],
    )
    assert _rows(wb["1. Um"])[1] == ("A", "por avaliar")


@pytest.mark.asyncio
async def test_arrival_without_a_result_still_counts_as_attendance():
    arrival = SimpleNamespace(team_id=1, checkpoint_id=10, arrived_at=datetime(2026, 5, 1, 10, 0))
    wb = await _build([_team(1, "A")], [_cp(10, 1, "Um")], [], arrivals=[arrival])
    assert wb.sheetnames == ["Overall", "1. Um"]
    assert _rows(wb["Overall"])[1] == ("A", 0, 0)


@pytest.mark.asyncio
async def test_side_mechanic_sheets_are_absent_when_unused():
    wb = await _build([_team(1, "A")], [_cp(10, 1, "Um")], [_result(1, 10)])
    assert "Hints" not in wb.sheetnames
    assert "Skips" not in wb.sheetnames
    assert "Manual Awards" not in wb.sheetnames
    assert "Badges" not in wb.sheetnames


@pytest.mark.asyncio
async def test_hint_and_skip_sheets_appear_when_used():
    when = datetime(2026, 5, 1, 10, 30)
    hint = SimpleNamespace(team_id=1, checkpoint_id=10, revealed_at=when, cost=-10)
    skip = SimpleNamespace(team_id=1, checkpoint_id=10, skipped_at=when, cost=-25)
    wb = await _build(
        [_team(1, "A")],
        [_cp(10, 1, "Um")],
        [_result(1, 10)],
        hint_reveals=[hint],
        skips=[skip],
    )
    assert _rows(wb["Hints"])[1] == ("A", "Um", when, -10)
    assert _rows(wb["Skips"])[1] == ("A", "Um", when, -25)


@pytest.mark.asyncio
async def test_manual_award_sheet_excludes_automatic_overflow_carries():
    when = datetime(2026, 5, 1, 12, 0)
    manual = SimpleNamespace(
        team_id=1,
        points=15.0,
        reason="Criatividade",
        awarded_at=when,
        activity_result_id=None,
        is_active=True,
    )
    automatic = SimpleNamespace(
        team_id=1,
        points=-4.0,
        reason="Excesso",
        awarded_at=when,
        activity_result_id=99,
        is_active=True,
    )
    wb = await _build(
        [_team(1, "A")], [_cp(10, 1, "Um")], [_result(1, 10)], awards=[manual, automatic]
    )
    rows = _rows(wb["Manual Awards"])
    assert len(rows) == 2  # header + the manual one only
    assert rows[1] == ("A", 15.0, "Criatividade", when)


@pytest.mark.asyncio
async def test_badges_sheet_appears_when_badges_were_awarded():
    when = datetime(2026, 5, 1, 13, 0)
    badge = SimpleNamespace(
        team_id=1, badge_type="head_to_head_win", checkpoint_id=10, awarded_at=when
    )
    wb = await _build([_team(1, "A")], [_cp(10, 1, "Um")], [_result(1, 10)], badges=[badge])
    assert _rows(wb["Badges"])[1] == ("A", "head_to_head_win", "Um", when)


@pytest.mark.asyncio
async def test_result_for_unknown_team_is_skipped():
    """A result whose team_id isn't in the current team list (e.g. the team
    was deleted after scoring) must be skipped rather than raising a
    KeyError or polluting another team's totals."""
    teams = [_team(1, "A")]
    cps = [_cp(10, 1, "Um")]
    results = [
        _result(1, 10, final_score=6.0),
        _result(999, 10, final_score=100.0),  # orphaned team_id, not in `teams`
    ]
    wb = await _build(teams, cps, results)

    rows = _rows(wb["Overall"])
    assert len(rows) == 2  # header + team A only
    assert rows[1] == ("A", 6, 6)


@pytest.mark.asyncio
async def test_malformed_penalty_value_defaults_to_zero():
    teams = [_team(1, "A")]
    cps = [_cp(10, 1, "Um")]
    results = [_result(1, 10, penalty_counts={"vomit": 2}, penalties={"vomit": "oops"})]
    wb = await _build(teams, cps, results)
    # The count is what the column shows; the malformed points value coerces
    # to 0 in the rate lookup rather than raising.
    assert _rows(wb["1. Um"])[0] == ("Team", "Vómitos (-)", "Total Checkpoint")
    assert _rows(wb["1. Um"])[1] == ("A", 2, 6)


@pytest.mark.asyncio
async def test_illegal_and_overlong_checkpoint_names_are_sanitised():
    long_name = "Bar com um nome absurdamente comprido [teste]"
    wb = await _build([_team(1, "A")], [_cp(10, 1, long_name)], [_result(1, 10)])
    title = wb.sheetnames[1]
    assert len(title) <= 31
    assert "[" not in title and "]" not in title


@pytest.mark.asyncio
async def test_skipped_checkpoint_counts_as_engagement_not_as_absence():
    """Giving up on a post is a decision the team made there, not a post it
    never reached — a blank would say the opposite of what happened."""
    skip = SimpleNamespace(
        team_id=1, checkpoint_id=10, skipped_at=datetime(2026, 5, 1, 10, 0), cost=-25
    )
    wb = await _build([_team(1, "A")], [_cp(10, 1, "Um")], [], skips=[skip])
    assert _rows(wb["Overall"])[1] == ("A", 0, 0)
