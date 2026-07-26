"""Unit tests for DynamicScoringService, exercised directly against real
Postgres — fills a gap not covered by app/tests/api/test_dynamic_scoring.py:
legacy/global rules (event_id=None) must still surface alongside the current
event's own rules, since list_rules ORs the two.
"""

from app.models.dynamic_scoring import DynamicRule
from app.services.dynamic_scoring_service import DynamicScoringService
from app.tests.conftest import make_event as _make_event


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
        # given: a rule belonging to some other event id, not the current one
        await _make_event(pg_session)
        other_event_rule = DynamicRule(name="Other Event Bonus", event_id=999999)
        pg_session.add(other_event_rule)
        await pg_session.commit()

        service = DynamicScoringService(pg_session)

        # when
        rules = await service.list_rules()

        # then
        assert "Other Event Bonus" not in {r.name for r in rules}
