"""Read-only DB access for a full event dossier.

Wraps `EventResultsQuery` (scores) with the reads the rest of the dossier
needs: people, route content and the two audit trails. Every query is scoped
to one event, but only `Activity`, `RouteStage`, `EventParticipation` and
`AuditLog` carry `event_id` directly — the rest reach it through `Team` or
`CheckPoint`, following the joins the existing CRUD modules already use.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.activity import Activity, ActivityResult
from app.models.audit_log import AuditLog
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.checkpoint_media import CheckpointMedia
from app.models.evaluation_history import EvaluationHistory
from app.models.participation import EventParticipation
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.models.route_stage import RouteStage
from app.models.team import Team
from app.models.user import User
from app.services.event_report_context import (
    EventAuditTrail,
    EventContent,
    EventReportContext,
    EventRoster,
)
from app.services.event_results_query import EventResultsQuery


class EventReportQuery:
    """Loads one event's complete dossier."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.results = EventResultsQuery(db)

    # ---------- people ----------

    async def staff_assignments(self, event_id: int) -> list[RallyStaffAssignment]:
        stmt = (
            select(RallyStaffAssignment)
            .join(CheckPoint, RallyStaffAssignment.checkpoint_id == CheckPoint.id)
            .where(CheckPoint.event_id == event_id)
            .options(selectinload(RallyStaffAssignment.checkpoint))
        )
        return list((await self.db.scalars(stmt)).all())

    async def guide_assignments(self, event_id: int) -> list[RallyGuideAssignment]:
        stmt = (
            select(RallyGuideAssignment)
            .join(Team, RallyGuideAssignment.team_id == Team.id)
            .where(Team.event_id == event_id)
            .options(selectinload(RallyGuideAssignment.team))
        )
        return list((await self.db.scalars(stmt)).all())

    async def members(self, event_id: int) -> list[User]:
        stmt = (
            select(User)
            .join(Team, User.team_id == Team.id)
            .where(Team.event_id == event_id)
            .order_by(User.name)
        )
        return list((await self.db.scalars(stmt)).all())

    async def assigned_users(self, event_id: int) -> list[User]:
        """Every user named by a staff or guide assignment in this event.

        `RallyStaffAssignment.user_id` is deliberately not a foreign key, so
        the names have to be fetched by id rather than joined through a
        relationship; `User.staff_checkpoint_id` alone would miss guides and
        any staff row whose user was never pointed at the post.
        """
        ids = {a.user_id for a in await self.staff_assignments(event_id)}
        ids |= {a.user_id for a in await self.guide_assignments(event_id)}
        if not ids:
            return []
        stmt = select(User).where(User.id.in_(ids)).order_by(User.name)
        return list((await self.db.scalars(stmt)).all())

    async def participations(self, event_id: int) -> list[EventParticipation]:
        stmt = (
            select(EventParticipation)
            .where(EventParticipation.event_id == event_id)
            .order_by(EventParticipation.joined_at)
        )
        return list((await self.db.scalars(stmt)).all())

    # ---------- route content ----------

    async def activities(self, event_id: int) -> list[Activity]:
        stmt = (
            select(Activity)
            .where(Activity.event_id == event_id)
            .order_by(Activity.checkpoint_id, Activity.name)
        )
        return list((await self.db.scalars(stmt)).all())

    async def indications(self, event_id: int) -> list[CheckpointGuideIndication]:
        stmt = (
            select(CheckpointGuideIndication)
            .join(CheckPoint, CheckpointGuideIndication.checkpoint_id == CheckPoint.id)
            .where(CheckPoint.event_id == event_id)
            .order_by(CheckpointGuideIndication.checkpoint_id, CheckpointGuideIndication.order)
        )
        return list((await self.db.scalars(stmt)).all())

    async def media(self, event_id: int) -> list[CheckpointMedia]:
        stmt = (
            select(CheckpointMedia)
            .join(CheckPoint, CheckpointMedia.checkpoint_id == CheckPoint.id)
            .where(CheckPoint.event_id == event_id)
            .order_by(CheckpointMedia.checkpoint_id, CheckpointMedia.order)
        )
        return list((await self.db.scalars(stmt)).all())

    async def stages(self, event_id: int) -> list[RouteStage]:
        stmt = select(RouteStage).where(RouteStage.event_id == event_id).order_by(RouteStage.order)
        return list((await self.db.scalars(stmt)).all())

    # ---------- audit trails ----------

    async def evaluations(self, event_id: int) -> list[EvaluationHistory]:
        """Score edits and team contests for this event's results.

        There is no event-scoped history query in the codebase — the read API
        (`app/api/api_v1/staff_evaluation.py`) only ever fetches one result's
        history — so this joins out to the team to scope it.
        """
        stmt = (
            select(EvaluationHistory)
            .join(ActivityResult, EvaluationHistory.result_id == ActivityResult.id)
            .join(Team, ActivityResult.team_id == Team.id)
            .where(Team.event_id == event_id)
            .order_by(EvaluationHistory.created_at)
        )
        return list((await self.db.scalars(stmt)).all())

    async def audit_log(self, event_id: int) -> list[AuditLog]:
        """Administrative actions only.

        Score edits are *not* here — they live solely in `EvaluationHistory`.
        Rows with a NULL `event_id` are global and deliberately excluded.
        """
        stmt = select(AuditLog).where(AuditLog.event_id == event_id).order_by(AuditLog.created_at)
        return list((await self.db.scalars(stmt)).all())

    async def results_by_id(self, event_id: int) -> dict[int, ActivityResult]:
        """Results keyed by id so a history row can name its team and post."""
        stmt = (
            select(ActivityResult)
            .options(joinedload(ActivityResult.activity).joinedload(Activity.checkpoint))
            .join(Team, ActivityResult.team_id == Team.id)
            .where(Team.event_id == event_id)
        )
        return {r.id: r for r in (await self.db.scalars(stmt)).all()}

    # ---------- composition ----------

    async def load(self, event_id: int) -> EventReportContext:
        return EventReportContext(
            results=await self.results.load(event_id),
            roster=EventRoster(
                staff_assignments=await self.staff_assignments(event_id),
                guide_assignments=await self.guide_assignments(event_id),
                members=await self.members(event_id),
                staff_users=await self.assigned_users(event_id),
                participations=await self.participations(event_id),
            ),
            content=EventContent(
                activities=await self.activities(event_id),
                indications=await self.indications(event_id),
                media=await self.media(event_id),
                stages=await self.stages(event_id),
            ),
            audit=EventAuditTrail(
                evaluations=await self.evaluations(event_id),
                audit_log=await self.audit_log(event_id),
                result_by_id=await self.results_by_id(event_id),
            ),
        )
