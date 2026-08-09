"""Admin CRUD for route stages — the blocks a route is divided into.

Stages are pure route configuration, so everything here is admin-only. What a
team sees of them is the effect on its own route (see ``CheckpointService``),
never the rules themselves.
"""

from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api import deps
from app.core.exceptions import RallyValidationError
from app.models.route_stage import RouteStage
from app.schemas.route_stage import RouteStageCreate, RouteStageResponse, RouteStageUpdate
from app.schemas.user import DetailedUser


class RouteStageController:
    """REST controller for /route-stages."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/route-stages",
            self.list_stages,
            methods=["GET"],
            status_code=200,
            name="list_route_stages",
        )
        self.router.add_api_route(
            "/route-stages",
            self.create_stage,
            methods=["POST"],
            status_code=201,
            name="create_route_stage",
        )
        self.router.add_api_route(
            "/route-stages/{id}",
            self.update_stage,
            methods=["PUT"],
            status_code=200,
            name="update_route_stage",
        )
        self.router.add_api_route(
            "/route-stages/{id}",
            self.delete_stage,
            methods=["DELETE"],
            status_code=200,
            name="delete_route_stage",
        )

    async def _to_response(
        self, db: AsyncSession, stages: Sequence[RouteStage]
    ) -> list[RouteStageResponse]:
        """Attach each stage's posts, in route order."""
        checkpoints = await crud.checkpoint.get_all_ordered(db, include_drafts=True)
        by_stage: dict[int, list[int]] = {}
        for cp in checkpoints:
            if cp.stage_id is not None:
                by_stage.setdefault(cp.stage_id, []).append(cp.id)

        responses: list[RouteStageResponse] = []
        for stage in stages:
            response = RouteStageResponse.model_validate(stage)
            response.checkpoint_ids = by_stage.get(response.id, [])
            responses.append(response)
        return responses

    async def list_stages(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        _: Annotated[DetailedUser, Depends(deps.get_admin_or_staff)],
    ) -> list[RouteStageResponse]:
        stages = list(await crud.route_stage.get_all_ordered(db))
        return await self._to_response(db, stages)

    async def create_stage(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        stage_in: RouteStageCreate,
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
    ) -> RouteStageResponse:
        existing = await crud.route_stage.get_all_ordered(db)
        if any(s.order == stage_in.order for s in existing):
            raise RallyValidationError(f"A stage with order {stage_in.order} already exists")
        stage = await crud.route_stage.create(db, obj_in=stage_in, commit=True)
        # Stage order decides checkpoint order, so a new stage renumbers the
        # route the moment posts are assigned to it.
        await crud.checkpoint.resequence(db)
        return (await self._to_response(db, [stage]))[0]

    async def update_stage(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        stage_in: RouteStageUpdate,
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
    ) -> RouteStageResponse:
        if stage_in.order is not None:
            clashing = [
                s
                for s in await crud.route_stage.get_all_ordered(db)
                if s.order == stage_in.order and s.id != id
            ]
            if clashing:
                raise RallyValidationError(f"A stage with order {stage_in.order} already exists")
        stage = await crud.route_stage.update(db, id=id, obj_in=stage_in, commit=True)
        await crud.checkpoint.resequence(db)
        return (await self._to_response(db, [stage]))[0]

    async def delete_stage(
        self,
        *,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        id: int,
        _: Annotated[DetailedUser, Depends(deps.get_admin)],
    ) -> dict[str, str]:
        """Delete a stage. Its posts stay in the route, unstaged — deleting a
        rule must not delete the places."""
        await crud.route_stage.remove(db, id=id, commit=True)
        await crud.checkpoint.resequence(db)
        return {"message": "Route stage deleted successfully"}


router = RouteStageController().router
