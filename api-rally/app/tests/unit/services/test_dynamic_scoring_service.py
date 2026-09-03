"""Unit tests for DynamicScoringService, exercised directly against real
Postgres.

Besides event scoping for legacy/global rules, these tests cover the
transaction boundary around manual DynamicAward creation/removal. The
application session uses autoflush=False, so award mutations must be flushed
before score recomputation queries run.
"""

from sqlalchemy import select

from app.crud.crud_team import team as crud_team
from app.models.activity import RallyEvent
from app.models.dynamic_scoring import DynamicAward, DynamicRule
from app.schemas.team import TeamCreate
from app.services.dynamic_scoring_service import DynamicScoringService
from app.services.scoring_service import ScoringService
from app.tests.conftest import make_event as _make_event


async def _make_team(db, name: str = "Team A"):
    return await crud_team.create(db, obj_in=TeamCreate(name=name))


class TestListRules:
    async def test_global_rule_and_current_event_rule_both_appear(self, pg_session) -> None:
        # given: one rule scoped to no event (legacy/global), one scoped to
        # the current event
        event = await _make_event(pg_session)
        global_rule = DynamicRule(name="Global Bonus", event_id=None)
        event_rule = DynamicRule(name="Event Bonus", event_id=event.id)
        pg_session.add_all([global_rule, event_rule])
        await pg_session.commit()

        service = DynamicScoringService(pg_session)

        # when
        rules = await service.list_rules()

        # then
        names = {r.name for r in rules}
        assert names == {"Global Bonus", "Event Bonus"}

    async def test_rule_scoped_to_a_different_event_is_excluded(self, pg_session) -> None:
        # given: a rule belonging to a real, but non-current, event
        await _make_event(pg_session)
        other_event = RallyEvent(name="Other Event", is_current=False)
        pg_session.add(other_event)
        await pg_session.commit()
        await pg_session.refresh(other_event)

        other_event_rule = DynamicRule(name="Other Event Bonus", event_id=other_event.id)
        pg_session.add(other_event_rule)
        await pg_session.commit()

        service = DynamicScoringService(pg_session)

        # when
        rules = await service.list_rules()

        # then
        assert "Other Event Bonus" not in {r.name for r in rules}


class TestManualAwardsFlushBeforeScoring:
    async def test_create_award_is_visible_to_scorer_before_recompute(
        self, pg_session, monkeypatch
    ) -> None:
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        scorer_saw_award = False

        async def assert_award_visible(_scoring_service, team_id: int) -> bool:
            nonlocal scorer_saw_award
            stmt = select(DynamicAward).where(
                DynamicAward.team_id == team_id,
                DynamicAward.is_active.is_(True),
            )
            scorer_saw_award = (await pg_session.scalars(stmt)).first() is not None
            return True

        monkeypatch.setattr(
            ScoringService,
            "update_team_scores",
            assert_award_visible,
        )

        award = await DynamicScoringService(pg_session).create_award(
            team_id=team.id,
            points=25,
            reason="Manual bonus",
        )

        assert award.id is not None
        assert scorer_saw_award is True

    async def test_delete_award_is_hidden_from_scorer_before_recompute(
        self, pg_session, monkeypatch
    ) -> None:
        event = await _make_event(pg_session)
        team = await _make_team(pg_session)
        award = DynamicAward(
            team_id=team.id,
            event_id=event.id,
            points=25,
            reason="Manual bonus",
            is_active=True,
        )
        pg_session.add(award)
        await pg_session.commit()
        await pg_session.refresh(award)

        scorer_saw_active_award = True

        async def assert_award_hidden(_scoring_service, team_id: int) -> bool:
            nonlocal scorer_saw_active_award
            stmt = select(DynamicAward).where(
                DynamicAward.id == award.id,
                DynamicAward.team_id == team_id,
                DynamicAward.is_active.is_(True),
            )
            scorer_saw_active_award = (await pg_session.scalars(stmt)).first() is not None
            return True

        monkeypatch.setattr(
            ScoringService,
            "update_team_scores",
            assert_award_hidden,
        )

        await DynamicScoringService(pg_session).delete_award(award.id)

        assert scorer_saw_active_award is False
