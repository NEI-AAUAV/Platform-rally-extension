"""Hint economy endpoints: a team unlocks guide indications for the checkpoint
it is currently hunting, paying the ``hint_penalty`` for each.

Team-token only. Both routes are scoped to the requesting team, so there is no
checkpoint_id a team can pass to read someone else's purchases or a post it has
not reached.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud import crud_activity
from app.schemas.hint import HintReveal, TeamHints, TeamHintSummary
from app.schemas.team_auth import TeamTokenData
from app.services.audit_service import AuditActor, record_audit
from app.services.deps import get_hint_service
from app.services.hint_service import HintService

CHECKPOINT_NOT_FOUND = "Checkpoint not found"


class CheckpointHintController:
    """REST controller for team-facing checkpoint hints."""

    def __init__(self) -> None:
        self.router = APIRouter()
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/checkpoint/{checkpoint_id}/hints",
            self.list_hints,
            methods=["GET"],
            name="list_checkpoint_hints",
            responses={
                401: {"description": "Authentication required (Team Token)"},
                404: {"description": CHECKPOINT_NOT_FOUND},
            },
        )
        self.router.add_api_route(
            "/team-auth/hints",
            self.list_team_hints,
            methods=["GET"],
            name="list_team_hints",
            # Under /team-auth, not /team: the team router owns /team/{id} and
            # would swallow /team/hints as an id. Team-token routes live here
            # anyway (see team_auth.py's contest endpoint).
            responses={401: {"description": "Authentication required (Team Token)"}},
        )
        self.router.add_api_route(
            "/checkpoint/{checkpoint_id}/hint",
            self.reveal_hint,
            methods=["POST"],
            name="reveal_checkpoint_hint",
            responses={
                400: {"description": "Not the team's current checkpoint, or no hints left"},
                401: {"description": "Authentication required (Team Token)"},
                404: {"description": CHECKPOINT_NOT_FOUND},
            },
        )

    async def list_hints(
        self,
        checkpoint_id: int,
        team: Annotated[TeamTokenData, Depends(deps.get_current_team)],
        service: Annotated[HintService, Depends(get_hint_service)],
    ) -> TeamHints:
        """Hints this team already paid for at a checkpoint, plus how many are left."""
        return await service.list_hints(team_id=team.team_id, checkpoint_id=checkpoint_id)

    async def list_team_hints(
        self,
        team: Annotated[TeamTokenData, Depends(deps.get_current_team)],
        service: Annotated[HintService, Depends(get_hint_service)],
    ) -> TeamHintSummary:
        """Every hint this team has bought across the event, and what it cost.

        The per-checkpoint listing only covers one post; a team that spent
        points at several has no other way to add them up, since the awards
        carrying the charges are admin-only.
        """
        return await service.summary_for_team(team_id=team.team_id)

    async def reveal_hint(
        self,
        checkpoint_id: int,
        db: Annotated[AsyncSession, Depends(deps.get_db)],
        team: Annotated[TeamTokenData, Depends(deps.get_current_team)],
        service: Annotated[HintService, Depends(get_hint_service)],
    ) -> HintReveal:
        """Unlock the next hint for this checkpoint and charge the team."""
        reveal = await service.reveal_next(team_id=team.team_id, checkpoint_id=checkpoint_id)

        # Buying a hint moves a team's score, so it belongs in the audit log
        # for the same reason a GPS arrival does: an admin looking into a
        # scoring dispute needs to see it. A free hint (cost 0) still gets an
        # entry — it explains the reveal itself.
        event = await crud_activity.rally_event.get_current(db)
        await record_audit(
            db,
            action="hint.revealed",
            actor=AuditActor(id=str(team.team_id), name=team.team_name, kind="team"),
            target_type="team",
            target_id=str(team.team_id),
            event_id=event.id if event else None,
            note=(
                f"checkpoint_id={checkpoint_id} indication_id={reveal.indication_id} "
                f"cost={reveal.cost}"
            ),
        )
        return reveal


router = CheckpointHintController().router
