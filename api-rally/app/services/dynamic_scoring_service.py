"""Business rules and persistence for dynamic scoring rules and awards."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.crud.crud_activity import rally_event
from app.models.dynamic_scoring import (
    PENALTY_COUNTER_RULE_TYPE,
    DynamicAward,
    DynamicRule,
)
from app.services.scoring_service import ScoringService

RULE_NOT_FOUND = "Rule not found"
AWARD_NOT_FOUND = "Award not found"


class DynamicScoringService:
    """Lifecycle for DynamicRule/DynamicAward, plus the score recompute they trigger."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_rules(self) -> list[DynamicRule]:
        event = await rally_event.get_current(self._db)
        event_id = event.id if event else None
        stmt = select(DynamicRule).where(
            DynamicRule.is_active.is_(True),
            (DynamicRule.event_id == event_id) | (DynamicRule.event_id.is_(None)),
        )
        return list((await self._db.scalars(stmt)).all())

    async def create_rule(self, **fields: object) -> DynamicRule:
        event = await rally_event.get_current(self._db)
        # rule_type is fixed: the only kind of rule now is a global penalty counter.
        fields.pop("rule_type", None)
        rule = DynamicRule(
            event_id=event.id if event else None,
            rule_type=PENALTY_COUNTER_RULE_TYPE,
            **fields,
        )
        self._db.add(rule)
        await self._db.commit()
        await self._db.refresh(rule)
        return rule

    async def update_rule(self, rule_id: int, **fields: object) -> DynamicRule:
        rule = await self._db.get(DynamicRule, rule_id)
        if not rule:
            raise RallyNotFoundError(RULE_NOT_FOUND)
        fields.pop("rule_type", None)
        for field, value in fields.items():
            setattr(rule, field, value)
        await self._db.commit()
        await self._db.refresh(rule)
        return rule

    async def delete_rule(self, rule_id: int) -> None:
        """Soft-delete: results already priced with this rule's ``g_<id>``
        key keep a price (via ``penalty_prices(include_inactive=True)``) so
        editing them or running a retroactive recompute doesn't 500. A hard
        delete would orphan that key immediately.
        """
        rule = await self._db.get(DynamicRule, rule_id)
        if not rule:
            raise RallyNotFoundError(RULE_NOT_FOUND)
        rule.is_active = False
        await self._db.commit()

    async def list_awards(self, *, team_id: int | None) -> list[DynamicAward]:
        stmt = select(DynamicAward).where(DynamicAward.is_active.is_(True))
        if team_id is not None:
            stmt = stmt.where(DynamicAward.team_id == team_id)
        return list((await self._db.scalars(stmt)).all())

    async def create_award(
        self, *, team_id: int, points: float, reason: str | None
    ) -> DynamicAward:
        event = await rally_event.get_current(self._db)
        award = DynamicAward(
            team_id=team_id,
            event_id=event.id if event else None,
            points=points,
            reason=reason,
            is_active=True,
        )
        self._db.add(award)

        # AsyncSession is configured with autoflush=False. Persist the new
        # score source into the current transaction before the scorer runs so
        # its SELECTs can see this award. The scorer owns the final commit.
        await self._db.flush()

        await ScoringService(self._db).update_team_scores(team_id)
        await self._db.refresh(award)
        return award

    async def delete_award(self, award_id: int) -> None:
        award = await self._db.get(DynamicAward, award_id)
        if not award:
            raise RallyNotFoundError(AWARD_NOT_FOUND)
        # an award with an activity_result_id is system-generated — the
        # shadow of one result's penalty overflowing its activity's points
        # (see ScoringService._sync_excess_penalty_award). It isn't an
        # independent admin decision to delete: the next edit of that result,
        # or a reprice, re-finds this same row by activity_result_id and
        # forces is_active back to True regardless, silently undoing the
        # deletion ("zombie" award). It disappears on its own once the
        # penalty no longer exceeds the activity's points.
        if award.activity_result_id is not None:
            raise RallyValidationError(
                "System-generated award cannot be deleted directly — it clears "
                "automatically once the underlying penalty no longer exceeds "
                "the activity's points."
            )
        team_id = award.team_id
        award.is_active = False

        # With autoflush=False, make the soft-delete visible to the scorer
        # before it aggregates active awards. The scorer owns the final commit.
        await self._db.flush()

        await ScoringService(self._db).update_team_scores(team_id)
