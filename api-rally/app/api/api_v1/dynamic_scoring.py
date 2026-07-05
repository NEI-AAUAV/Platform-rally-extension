"""Dynamic scoring endpoints (D4).

DynamicRule management:
  GET  /dynamic-rules              — list rules for current event (public)
  POST /dynamic-rules              — create rule (admin)
  PUT  /dynamic-rules/{id}         — update rule (admin)
  DELETE /dynamic-rules/{id}       — delete rule (admin)

DynamicAward management:
  GET  /dynamic-awards             — list awards, optionally filter by team
  POST /dynamic-awards             — apply a one-off award to a team (admin)
  DELETE /dynamic-awards/{id}      — remove an award (admin)
"""
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud.crud_activity import rally_event
from app.models.dynamic_scoring import DynamicAward, DynamicRule
from app.services.scoring_service import ScoringService

router = APIRouter()


# ---------- Schemas ----------

class DynamicRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    rule_type: str = "bonus"
    points: float = 0.0
    is_active: bool = True
    is_automatic: bool = False


class DynamicRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    rule_type: Optional[str] = None
    points: Optional[float] = None
    is_active: Optional[bool] = None
    is_automatic: Optional[bool] = None


class DynamicRuleResponse(BaseModel):
    id: int
    event_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    rule_type: str
    points: float
    is_active: bool
    is_automatic: bool

    model_config = {"from_attributes": True}


class DynamicAwardCreate(BaseModel):
    team_id: int
    points: float
    reason: Optional[str] = None
    rule_id: Optional[int] = None


class DynamicAwardResponse(BaseModel):
    id: int
    team_id: int
    event_id: Optional[int] = None
    rule_id: Optional[int] = None
    points: float
    reason: Optional[str] = None
    is_active: bool

    model_config = {"from_attributes": True}


# ---------- DynamicRule endpoints ----------

@router.get("/dynamic-rules")
async def list_dynamic_rules(
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> List[DynamicRuleResponse]:
    event = await rally_event.get_current(db)
    event_id = event.id if event else None
    stmt = select(DynamicRule).where(
        (DynamicRule.event_id == event_id) | (DynamicRule.event_id.is_(None))
    )
    rows = (await db.scalars(stmt)).all()
    return [DynamicRuleResponse.model_validate(r) for r in rows]


@router.post(
    "/dynamic-rules",
    status_code=201,
    dependencies=[Depends(deps.get_admin)],
)
async def create_dynamic_rule(
    obj_in: DynamicRuleCreate,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> DynamicRuleResponse:
    event = await rally_event.get_current(db)
    rule = DynamicRule(
        event_id=event.id if event else None,
        **obj_in.model_dump(),
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return DynamicRuleResponse.model_validate(rule)


@router.put(
    "/dynamic-rules/{rule_id}",
    dependencies=[Depends(deps.get_admin)],
    responses={404: {"description": "Rule not found"}},
)
async def update_dynamic_rule(
    rule_id: int,
    obj_in: DynamicRuleUpdate,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> DynamicRuleResponse:
    rule = await db.get(DynamicRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for field, value in obj_in.model_dump(exclude_none=True).items():
        setattr(rule, field, value)
    await db.commit()
    await db.refresh(rule)
    return DynamicRuleResponse.model_validate(rule)


@router.delete(
    "/dynamic-rules/{rule_id}",
    status_code=204,
    dependencies=[Depends(deps.get_admin)],
    responses={404: {"description": "Rule not found"}},
)
async def delete_dynamic_rule(
    rule_id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> None:
    rule = await db.get(DynamicRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()


# ---------- DynamicAward endpoints ----------

@router.get("/dynamic-awards")
async def list_dynamic_awards(
    db: Annotated[AsyncSession, Depends(deps.get_db)],
    _: Annotated[None, Depends(deps.get_admin)],
    team_id: Optional[int] = None,
) -> List[DynamicAwardResponse]:
    stmt = select(DynamicAward).where(DynamicAward.is_active.is_(True))
    if team_id is not None:
        stmt = stmt.where(DynamicAward.team_id == team_id)
    rows = (await db.scalars(stmt)).all()
    return [DynamicAwardResponse.model_validate(r) for r in rows]


@router.post(
    "/dynamic-awards",
    status_code=201,
    dependencies=[Depends(deps.get_admin)],
)
async def create_dynamic_award(
    obj_in: DynamicAwardCreate,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> DynamicAwardResponse:
    event = await rally_event.get_current(db)
    award = DynamicAward(
        team_id=obj_in.team_id,
        event_id=event.id if event else None,
        rule_id=obj_in.rule_id,
        points=obj_in.points,
        reason=obj_in.reason,
        is_active=True,
    )
    db.add(award)
    await db.commit()
    await db.refresh(award)
    # Trigger score recalculation so leaderboard reflects immediately
    await ScoringService(db).update_team_scores(obj_in.team_id)
    return DynamicAwardResponse.model_validate(award)


@router.delete(
    "/dynamic-awards/{award_id}",
    status_code=204,
    dependencies=[Depends(deps.get_admin)],
    responses={404: {"description": "Award not found"}},
)
async def delete_dynamic_award(
    award_id: int,
    db: Annotated[AsyncSession, Depends(deps.get_db)],
) -> None:
    award = await db.get(DynamicAward, award_id)
    if not award:
        raise HTTPException(status_code=404, detail="Award not found")
    team_id = award.team_id
    award.is_active = False
    await db.commit()
    # Recompute score now that the award is gone
    await ScoringService(db).update_team_scores(team_id)
