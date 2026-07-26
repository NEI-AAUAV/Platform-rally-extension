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

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.services.dynamic_scoring_service import DynamicScoringService

# ---------- Schemas ----------


class DynamicRuleCreate(BaseModel):
    name: str
    description: str | None = None
    rule_type: str = "bonus"
    points: float = 0.0
    is_active: bool = True
    is_automatic: bool = False


class DynamicRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    rule_type: str | None = None
    points: float | None = None
    is_active: bool | None = None
    is_automatic: bool | None = None


class DynamicRuleResponse(BaseModel):
    id: int
    event_id: int | None = None
    name: str
    description: str | None = None
    rule_type: str
    points: float
    is_active: bool
    is_automatic: bool

    model_config = {"from_attributes": True}


class DynamicAwardCreate(BaseModel):
    team_id: int
    points: float
    reason: str | None = None
    rule_id: int | None = None


class DynamicAwardResponse(BaseModel):
    id: int
    team_id: int
    event_id: int | None = None
    rule_id: int | None = None
    points: float
    reason: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class DynamicScoringController:
    """REST controller for dynamic scoring rules and awards."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/dynamic-rules", self.list_dynamic_rules, methods=["GET"], name="list_dynamic_rules"
        )
        self.router.add_api_route(
            "/dynamic-rules",
            self.create_dynamic_rule,
            methods=["POST"],
            status_code=201,
            name="create_dynamic_rule",
            dependencies=[Depends(deps.get_admin)],
        )
        self.router.add_api_route(
            "/dynamic-rules/{rule_id}",
            self.update_dynamic_rule,
            methods=["PUT"],
            name="update_dynamic_rule",
            dependencies=[Depends(deps.get_admin)],
            responses={404: {"description": "Rule not found"}},
        )
        self.router.add_api_route(
            "/dynamic-rules/{rule_id}",
            self.delete_dynamic_rule,
            methods=["DELETE"],
            status_code=204,
            name="delete_dynamic_rule",
            dependencies=[Depends(deps.get_admin)],
            responses={404: {"description": "Rule not found"}},
        )
        self.router.add_api_route(
            "/dynamic-awards",
            self.list_dynamic_awards,
            methods=["GET"],
            name="list_dynamic_awards",
        )
        self.router.add_api_route(
            "/dynamic-awards",
            self.create_dynamic_award,
            methods=["POST"],
            status_code=201,
            name="create_dynamic_award",
            dependencies=[Depends(deps.get_admin)],
        )
        self.router.add_api_route(
            "/dynamic-awards/{award_id}",
            self.delete_dynamic_award,
            methods=["DELETE"],
            status_code=204,
            name="delete_dynamic_award",
            dependencies=[Depends(deps.get_admin)],
            responses={404: {"description": "Award not found"}},
        )

    def _service(self, db: AsyncSession) -> DynamicScoringService:
        return DynamicScoringService(db)

    async def list_dynamic_rules(
        self, db: Annotated[AsyncSession, Depends(deps.get_db)]
    ) -> list[DynamicRuleResponse]:
        rules = await self._service(db).list_rules()
        return [DynamicRuleResponse.model_validate(r) for r in rules]

    async def create_dynamic_rule(
        self,
        obj_in: DynamicRuleCreate,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
    ) -> DynamicRuleResponse:
        rule = await self._service(db).create_rule(**obj_in.model_dump())
        return DynamicRuleResponse.model_validate(rule)

    async def update_dynamic_rule(
        self,
        rule_id: int,
        obj_in: DynamicRuleUpdate,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
    ) -> DynamicRuleResponse:
        rule = await self._service(db).update_rule(rule_id, **obj_in.model_dump(exclude_none=True))
        return DynamicRuleResponse.model_validate(rule)

    async def delete_dynamic_rule(
        self, rule_id: int, db: Annotated[AsyncSession, Depends(deps.get_db)]
    ) -> None:
        await self._service(db).delete_rule(rule_id)

    async def list_dynamic_awards(
        self,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        _: Annotated[None, Depends(deps.get_admin)],
        team_id: int | None = None,
    ) -> list[DynamicAwardResponse]:
        awards = await self._service(db).list_awards(team_id=team_id)
        return [DynamicAwardResponse.model_validate(a) for a in awards]

    async def create_dynamic_award(
        self,
        obj_in: DynamicAwardCreate,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
    ) -> DynamicAwardResponse:
        award = await self._service(db).create_award(
            team_id=obj_in.team_id,
            rule_id=obj_in.rule_id,
            points=obj_in.points,
            reason=obj_in.reason,
        )
        return DynamicAwardResponse.model_validate(award)

    async def delete_dynamic_award(
        self, award_id: int, db: Annotated[AsyncSession, Depends(deps.get_db)]
    ) -> None:
        await self._service(db).delete_award(award_id)


router = DynamicScoringController().router
