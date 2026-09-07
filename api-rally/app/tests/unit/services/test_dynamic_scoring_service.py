"""Unit tests for DynamicScoringService, exercised directly against real
Postgres.

Besides per-edition rule scoping, these tests cover the
transaction boundary around manual DynamicAward creation/removal. The
application session uses autoflush=False, so award mutations must be flushed
before score recomputation queries run.
"""

import pytest
from sqlalchemy import select

from app.core.exceptions import RallyValidationError
from app.crud.crud_team import team as crud_team
from app.models.activity import RallyEvent
from app.models.dynamic_scoring import (
    BONUS_COUNTER_RULE_TYPE,
    PENALTY_COUNTER_RULE_TYPE,
    DynamicAward,
    DynamicRule,
)
from app.schemas.team import TeamCreate
from app.services.dynamic_scoring_service import DynamicScoringService
from app.services.scoring_service import ScoringService
from app.tests.conftest import make_event as _make_event


async def _make_team(db, name: str = "Team A"):
    return await crud_team.create(db, obj_in=TeamCreate(name=name))


class TestListRules:
    async def test_only_the_current_events_rules_appear(self, pg_session) -> None:
        # given: two rules in the current event. There is no global scope: a
        # rule always belongs to exactly one edition.
        event = await _make_event(pg_session)
        pg_session.add_all(
            [
                DynamicRule(name="Bonus", event_id=event.id),
                DynamicRule(name="Event Bonus", event_id=event.id),
            ]
        )
        await pg_session.commit()

        service = DynamicScoringService(pg_session)

        # when
        rules = await service.list_rules()

        # then
        names = {r.name for r in rules}
        assert names == {"Bonus", "Event Bonus"}

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


class TestRuleTypes:
    async def test_create_defaults_to_a_penalty_counter(self, pg_session) -> None:
        """Callers written before bonus rules existed keep creating penalties."""
        await _make_event(pg_session)
        service = DynamicScoringService(pg_session)

        rule = await service.create_rule(name="Atraso", points=4.0)

        assert rule.rule_type == PENALTY_COUNTER_RULE_TYPE

    async def test_create_accepts_a_bonus_counter(self, pg_session) -> None:
        await _make_event(pg_session)
        service = DynamicScoringService(pg_session)

        rule = await service.create_rule(
            name="Criatividade", points=3.0, rule_type=BONUS_COUNTER_RULE_TYPE
        )

        assert rule.rule_type == BONUS_COUNTER_RULE_TYPE

    async def test_create_rejects_an_unknown_rule_type(self, pg_session) -> None:
        await _make_event(pg_session)
        service = DynamicScoringService(pg_session)

        with pytest.raises(RallyValidationError, match="Unknown rule type"):
            await service.create_rule(name="???", points=1.0, rule_type="teleport")

    async def test_list_returns_both_kinds(self, pg_session) -> None:
        """The staff form needs both so it can split them into two sections."""
        event = await _make_event(pg_session)
        pg_session.add_all(
            [
                DynamicRule(name="Atraso", event_id=event.id, rule_type=PENALTY_COUNTER_RULE_TYPE),
                DynamicRule(
                    name="Criatividade", event_id=event.id, rule_type=BONUS_COUNTER_RULE_TYPE
                ),
            ]
        )
        await pg_session.commit()

        rules = await DynamicScoringService(pg_session).list_rules()

        assert {r.name for r in rules} == {"Atraso", "Criatividade"}

    async def test_update_cannot_flip_the_rule_type(self, pg_session) -> None:
        """Results already scored carry the key this type produced."""
        await _make_event(pg_session)
        service = DynamicScoringService(pg_session)
        rule = await service.create_rule(
            name="Criatividade", points=3.0, rule_type=BONUS_COUNTER_RULE_TYPE
        )

        updated = await service.update_rule(
            rule.id, name="Criatividade II", rule_type=PENALTY_COUNTER_RULE_TYPE
        )

        assert updated.name == "Criatividade II"
        assert updated.rule_type == BONUS_COUNTER_RULE_TYPE


class TestActiveVersusDeleted:
    """``is_active`` is the admin's switch; ``deleted_at`` is the tombstone.

    They used to be the same flag, which is why switching a rule off made it
    vanish from the screen holding its switch — indistinguishable from a
    delete, and impossible to undo.
    """

    async def test_list_excludes_inactive_rules_by_default(self, pg_session) -> None:
        event = await _make_event(pg_session)
        pg_session.add_all(
            [
                DynamicRule(name="Ligada", event_id=event.id, is_active=True),
                DynamicRule(name="Desligada", event_id=event.id, is_active=False),
            ]
        )
        await pg_session.commit()

        rules = await DynamicScoringService(pg_session).list_rules()

        assert {r.name for r in rules} == {"Ligada"}

    async def test_list_includes_inactive_when_asked(self, pg_session) -> None:
        """The admin has to keep seeing a rule it switched off."""
        event = await _make_event(pg_session)
        pg_session.add_all(
            [
                DynamicRule(name="Ligada", event_id=event.id, is_active=True),
                DynamicRule(name="Desligada", event_id=event.id, is_active=False),
            ]
        )
        await pg_session.commit()

        rules = await DynamicScoringService(pg_session).list_rules(include_inactive=True)

        assert {r.name for r in rules} == {"Ligada", "Desligada"}

    async def test_toggling_a_rule_off_and_on_round_trips(self, pg_session) -> None:
        """The reported symptom: the switch only ever went one way."""
        await _make_event(pg_session)
        service = DynamicScoringService(pg_session)
        rule = await service.create_rule(name="Atraso", points=4.0)

        await service.update_rule(rule.id, is_active=False)
        after_off = await service.list_rules(include_inactive=True)
        # The row must survive being switched off — that is the whole bug.
        assert [r.is_active for r in after_off] == [False]

        await service.update_rule(rule.id, is_active=True)
        after_on = await service.list_rules()
        assert [r.name for r in after_on] == ["Atraso"]

    async def test_delete_marks_the_rule_deleted_without_touching_is_active(
        self, pg_session
    ) -> None:
        await _make_event(pg_session)
        service = DynamicScoringService(pg_session)
        rule = await service.create_rule(name="Atraso", points=4.0)

        await service.delete_rule(rule.id)
        await pg_session.refresh(rule)

        assert rule.deleted_at is not None
        assert rule.is_active is True, "the switch keeps the admin's last intent"

    async def test_a_deleted_rule_is_gone_even_with_include_inactive(self, pg_session) -> None:
        await _make_event(pg_session)
        service = DynamicScoringService(pg_session)
        rule = await service.create_rule(name="Atraso", points=4.0)
        await service.delete_rule(rule.id)

        assert await service.list_rules() == []
        assert await service.list_rules(include_inactive=True) == []


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
