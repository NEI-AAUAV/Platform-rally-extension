"""Business rules and persistence for dynamic scoring rules and awards.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyNotFoundError
from app.crud.crud_activity import rally_event
from app.models.dynamic_scoring import DynamicAward, DynamicRule
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
            (DynamicRule.event_id == event_id) | (DynamicRule.event_id.is_(None))
        )
        return list((await self._db.scalars(stmt)).all())

    async def create_rule(self, **fields: object) -> DynamicRule:
        event = await rally_event.get_current(self._db)
        rule = DynamicRule(event_id=event.id if event else None, **fields)
        self._db.add(rule)
        await self._db.commit()
        await self._db.refresh(rule)
        return rule

    async def update_rule(self, rule_id: int, **fields: object) -> DynamicRule:
        rule = await self._db.get(DynamicRule, rule_id)
        if not rule:
            raise RallyNotFoundError(RULE_NOT_FOUND)
        for field, value in fields.items():
            setattr(rule, field, value)
        await self._db.commit()
        await self._db.refresh(rule)
        return rule

    async def delete_rule(self, rule_id: int) -> None:
        rule = await self._db.get(DynamicRule, rule_id)
        if not rule:
            raise RallyNotFoundError(RULE_NOT_FOUND)
        await self._db.delete(rule)
        await self._db.commit()

    async def list_awards(self, *, team_id: int | None) -> list[DynamicAward]:
        stmt = select(DynamicAward).where(DynamicAward.is_active.is_(True))
        if team_id is not None:
            stmt = stmt.where(DynamicAward.team_id == team_id)
        return list((await self._db.scalars(stmt)).all())

    async def create_award(
        self, *, team_id: int, rule_id: int | None, points: float, reason: str | None
    ) -> DynamicAward:
        event = await rally_event.get_current(self._db)
        award = DynamicAward(
            team_id=team_id,
            event_id=event.id if event else None,
            rule_id=rule_id,
            points=points,
            reason=reason,
            is_active=True,
        )
        self._db.add(award)
        await self._db.commit()
        await self._db.refresh(award)
        # Trigger score recalculation so leaderboard reflects immediately.
        await ScoringService(self._db).update_team_scores(team_id)
        return award

    async def delete_award(self, award_id: int) -> None:
        award = await self._db.get(DynamicAward, award_id)
        if not award:
            raise RallyNotFoundError(AWARD_NOT_FOUND)
        team_id = award.team_id
        award.is_active = False
        await self._db.commit()
        # Recompute score now that the award is gone.
        await ScoringService(self._db).update_team_scores(team_id)
