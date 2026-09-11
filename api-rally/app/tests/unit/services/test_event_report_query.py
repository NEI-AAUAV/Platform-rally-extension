"""Event scoping for the dossier's reads, and the context's derived helpers.

The queries are checked by compiling each statement and asserting the event
filter is in it. That needs no database and catches the failure that matters:
a read that forgets to scope to one edition and quietly pulls another event's
teams, posts or audit rows into the report.
"""

from datetime import datetime
from types import SimpleNamespace

import pytest

from app.services.event_report_context import (
    EventAuditTrail,
    EventContent,
    EventReportContext,
    EventRoster,
    change_rows,
    display_name,
)
from app.services.event_report_query import EventReportQuery
from app.services.event_results_query import EventResultsData


class _RecordingDB:
    """Captures statements instead of executing them."""

    def __init__(self) -> None:
        self.statements: list[object] = []

    async def scalars(self, stmt):
        self.statements.append(stmt)
        return SimpleNamespace(all=lambda: [])

    async def scalar(self, stmt):
        # Implicitly None: the stub always reports "no such row".
        self.statements.append(stmt)

    async def get(self, _model, _pk):
        return None


def _sql(db: _RecordingDB) -> str:
    return str(db.statements[-1])


# ---------- event scoping ----------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "scope"),
    [
        ("staff_assignments", "checkpoints.event_id"),
        ("guide_assignments", "teams.event_id"),
        ("members", "teams.event_id"),
        ("participations", "event_participation.event_id"),
        ("activities", "activities.event_id"),
        ("indications", "checkpoints.event_id"),
        ("media", "checkpoints.event_id"),
        ("stages", "route_stages.event_id"),
        ("evaluations", "teams.event_id"),
        ("audit_log", "audit_log.event_id"),
        ("results_by_id", "teams.event_id"),
    ],
)
async def test_every_read_is_scoped_to_one_event(method: str, scope: str):
    db = _RecordingDB()
    query = EventReportQuery(db)
    await getattr(query, method)(1)
    assert scope in _sql(db)


@pytest.mark.asyncio
async def test_assigned_users_are_fetched_by_id_because_the_link_is_not_a_foreign_key():
    """`RallyStaffAssignment.user_id` is deliberately not an FK, so the names
    cannot be joined through a relationship."""
    db = _RecordingDB()
    await EventReportQuery(db).assigned_users(1)
    # No assignments came back, so no user lookup should have been issued.
    assert len(db.statements) == 2


@pytest.mark.asyncio
async def test_audit_log_excludes_rows_with_no_event():
    """A NULL event_id row is a global action, not this edition's."""
    db = _RecordingDB()
    await EventReportQuery(db).audit_log(1)
    sql = _sql(db)
    assert "audit_log.event_id = " in sql
    assert "IS NULL" not in sql


# ---------- display names ----------


def test_display_name_falls_back_through_email_then_id():
    assert display_name(SimpleNamespace(id=1, name="Ana", email="a@b.c")) == "Ana"
    assert display_name(SimpleNamespace(id=1, name="", email="a@b.c")) == "a@b.c"
    assert display_name(SimpleNamespace(id=1, name=None, email=None)) == "user#1"
    assert display_name(None) == "—"


# ---------- diff flattening ----------


def test_change_rows_flattens_a_before_after_diff():
    changes = {"final_score": {"before": 6, "after": 9}}
    assert change_rows(changes) == [("final_score", 6, 9)]


def test_change_rows_tolerates_a_contest_with_no_diff():
    assert change_rows({}) == []
    assert change_rows(None) == []


def test_change_rows_keeps_a_malformed_entry_rather_than_dropping_it():
    """A diff that is not the usual shape still says something happened."""
    assert change_rows({"weird": 3}) == [("weird", None, 3)]


# ---------- reconciliation ----------


def _team(tid: int, name: str, total: float = 0.0):
    return SimpleNamespace(id=tid, name=name, versus_group_id=None, photo_url="", total=total)


def _cp(cid: int, order: int):
    return SimpleNamespace(id=cid, order=order, name=f"P{order}", event_id=1)


def _result(team_id: int, cp_id: int, score: float = 6.0):
    return SimpleNamespace(
        id=1,
        team_id=team_id,
        activity=SimpleNamespace(checkpoint=SimpleNamespace(id=cp_id), config={}),
        is_completed=True,
        final_score=score,
        extra_shots=0,
        penalties={},
        penalty_counts={},
        bonuses={},
        bonus_counts={},
        result_data={},
        media_urls=[],
        judgment_status=None,
        team_vs_result=None,
    )


def _ctx(**kwargs) -> EventReportContext:
    kwargs.setdefault("teams", [])
    kwargs.setdefault("checkpoints", [])
    kwargs.setdefault("results", [])
    return EventReportContext(
        results=EventResultsData(**kwargs),
        roster=EventRoster(),
        content=EventContent(),
        audit=EventAuditTrail(),
    )


def test_adjustments_gather_hint_skip_and_award_points():
    """None of these ever reach a checkpoint column, yet all reach Team.total."""
    ctx = _ctx(
        teams=[_team(1, "A")],
        checkpoints=[_cp(10, 1)],
        results=[_result(1, 10)],
        hint_reveals=[
            SimpleNamespace(
                team_id=1,
                checkpoint_id=10,
                indication_id=1,
                revealed_at=datetime(2026, 5, 1),
                cost=-10,
            )
        ],
        skips=[
            SimpleNamespace(team_id=1, checkpoint_id=10, skipped_at=datetime(2026, 5, 1), cost=-25)
        ],
        awards=[
            SimpleNamespace(
                team_id=1,
                points=15.0,
                reason="",
                awarded_at=datetime(2026, 5, 1),
                activity_result_id=None,
                is_active=True,
            )
        ],
    )
    assert ctx.team_adjustments(1) == -20.0


def test_automatic_overflow_award_is_not_counted_as_a_manual_adjustment():
    ctx = _ctx(
        teams=[_team(1, "A")],
        awards=[
            SimpleNamespace(
                team_id=1,
                points=-4.0,
                reason="Excesso",
                awarded_at=datetime(2026, 5, 1),
                activity_result_id=99,
                is_active=True,
            )
        ],
    )
    assert ctx.team_adjustments(1) == 0.0


def test_totals_reconcile_when_the_checkpoint_sum_plus_adjustments_matches():
    ctx = _ctx(
        teams=[_team(1, "A", total=6.0)],
        checkpoints=[_cp(10, 1)],
        results=[_result(1, 10, 6.0)],
    )
    assert ctx.totals_reconcile() is True


def test_totals_do_not_reconcile_when_a_score_moved_without_a_recompute():
    ctx = _ctx(
        teams=[_team(1, "A", total=99.0)],
        checkpoints=[_cp(10, 1)],
        results=[_result(1, 10, 6.0)],
    )
    assert ctx.totals_reconcile() is False


def test_ranking_follows_the_recorded_total_not_the_checkpoint_sum():
    ctx = _ctx(
        teams=[_team(1, "Gastou", total=-4.0), _team(2, "Poupou", total=5.0)],
        checkpoints=[_cp(10, 1)],
        results=[_result(1, 10, 6.0), _result(2, 10, 5.0)],
    )
    assert [t.name for t in ctx.ranked_teams()] == ["Poupou", "Gastou"]


def test_progress_lists_only_the_posts_a_team_actually_reached():
    ctx = _ctx(
        teams=[_team(1, "A")],
        checkpoints=[_cp(10, 1), _cp(11, 2)],
        results=[_result(1, 10)],
    )
    reached = [cp.id for cp, _arrived, _score in ctx.team_progress(ctx.teams[0])]
    assert reached == [10]


def test_members_are_listed_captain_first():
    roster = EventRoster(
        members=[
            SimpleNamespace(id=2, name="Zé", team_id=1, is_captain=False),
            SimpleNamespace(id=1, name="Ana", team_id=1, is_captain=True),
        ]
    )
    assert [m.name for m in roster.members_of(1)] == ["Ana", "Zé"]
