"""Dynamic scoring endpoints (D4).

DynamicRule management:
  GET  /dynamic-rules              — list rules (penalty + bonus) for current event (public)
  POST /dynamic-rules              — create rule (admin)
  PUT  /dynamic-rules/{id}         — update rule (admin)
  DELETE /dynamic-rules/{id}       — delete rule (admin)

DynamicAward management:
  GET  /dynamic-awards             — list awards, optionally filter by team
  POST /dynamic-awards             — apply a one-off award to a team (admin)
  DELETE /dynamic-awards/{id}      — remove an award (admin)
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api import deps
from app.services.deps import get_dynamic_scoring_service
from app.services.dynamic_scoring_service import DynamicScoringService

# ---------- Schemas ----------


class DynamicRuleCreate(BaseModel):
    """A global counter shown to staff at every checkpoint.

    ``rule_type`` picks the side: ``penalty_counter`` ("cada X = -N pontos") or
    ``bonus_counter`` ("cada X = +N pontos"). ``points`` is the magnitude
    applied per occurrence, always positive. Defaults to a penalty counter, so
    clients written before bonus rules existed keep working unchanged.
    """

    name: str
    description: str | None = None
    rule_type: Literal["penalty_counter", "bonus_counter"] = "penalty_counter"
    points: float = 0.0
    # Ceiling on what this rule alone may award at one checkpoint. ``None`` is
    # unlimited, 0 is a real ceiling of zero. Distinct from the event-wide
    # ceiling on the *summed* bonus (rally_settings.default_max_bonus_points).
    max_points: Annotated[float, Field(ge=0)] | None = None
    is_active: bool = True


class DynamicRuleUpdate(BaseModel):
    """No ``rule_type``: the type is fixed at creation (see the service)."""

    name: str | None = None
    description: str | None = None
    points: float | None = None
    # Explicit ``null`` here means "remove the ceiling", so the controller has
    # to distinguish it from the field simply being absent.
    max_points: Annotated[float, Field(ge=0)] | None = None
    is_active: bool | None = None


class DynamicRuleResponse(BaseModel):
    id: int
    event_id: int | None = None
    name: str
    description: str | None = None
    rule_type: str
    points: float
    max_points: float | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class DynamicAwardCreate(BaseModel):
    team_id: int
    points: float
    reason: str | None = None


class DynamicAwardResponse(BaseModel):
    id: int
    team_id: int
    event_id: int | None = None
    activity_result_id: int | None = None
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

    async def list_dynamic_rules(
        self,
        service: Annotated[DynamicScoringService, Depends(get_dynamic_scoring_service)],
        include_inactive: bool = False,
    ) -> list[DynamicRuleResponse]:
        """Rules of the current event; deleted ones never appear.

        ``include_inactive`` is for the admin screen, which has to keep showing
        a rule it has switched off — otherwise the switch has nothing left to
        switch back on. The staff form omits it and sees only live rules.

        Stays public, like the listing already was: a rule that is switched off
        is no more sensitive than one that is on, and the active ones are
        public already.
        """
        rules = await service.list_rules(include_inactive=include_inactive)
        return [DynamicRuleResponse.model_validate(r) for r in rules]

    async def create_dynamic_rule(
        self,
        obj_in: DynamicRuleCreate,
        service: Annotated[DynamicScoringService, Depends(get_dynamic_scoring_service)],
    ) -> DynamicRuleResponse:
        rule = await service.create_rule(**obj_in.model_dump())
        return DynamicRuleResponse.model_validate(rule)

    async def update_dynamic_rule(
        self,
        rule_id: int,
        obj_in: DynamicRuleUpdate,
        service: Annotated[DynamicScoringService, Depends(get_dynamic_scoring_service)],
    ) -> DynamicRuleResponse:
        # ``exclude_none`` is what lets a partial update leave a field alone,
        # but it also swallows the one null that means something: clearing
        # max_points back to "no ceiling". Put that one back when the client
        # actually sent it.
        fields = obj_in.model_dump(exclude_none=True)
        if "max_points" in obj_in.model_fields_set:
            fields["max_points"] = obj_in.max_points
        rule = await service.update_rule(rule_id, **fields)
        return DynamicRuleResponse.model_validate(rule)

    async def delete_dynamic_rule(
        self,
        rule_id: int,
        service: Annotated[DynamicScoringService, Depends(get_dynamic_scoring_service)],
    ) -> None:
        await service.delete_rule(rule_id)

    async def list_dynamic_awards(
        self,
        _: Annotated[None, Depends(deps.get_admin)],
        service: Annotated[DynamicScoringService, Depends(get_dynamic_scoring_service)],
        team_id: int | None = None,
    ) -> list[DynamicAwardResponse]:
        awards = await service.list_awards(team_id=team_id)
        return [DynamicAwardResponse.model_validate(a) for a in awards]

    async def create_dynamic_award(
        self,
        obj_in: DynamicAwardCreate,
        service: Annotated[DynamicScoringService, Depends(get_dynamic_scoring_service)],
    ) -> DynamicAwardResponse:
        award = await service.create_award(
            team_id=obj_in.team_id,
            points=obj_in.points,
            reason=obj_in.reason,
        )
        return DynamicAwardResponse.model_validate(award)

    async def delete_dynamic_award(
        self,
        award_id: int,
        service: Annotated[DynamicScoringService, Depends(get_dynamic_scoring_service)],
    ) -> None:
        await service.delete_award(award_id)


router = DynamicScoringController().router
