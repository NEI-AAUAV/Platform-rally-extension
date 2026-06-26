"""CRUD for per-person event participation history."""
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participation import EventParticipation
from app.models.team import Team


class CRUDParticipation:
    async def get_for_sub(self, db: AsyncSession, *, authentik_sub: str) -> Sequence[EventParticipation]:
        """All participations for a person, newest first."""
        stmt = (
            select(EventParticipation)
            .where(EventParticipation.authentik_sub == authentik_sub)
            .order_by(EventParticipation.joined_at.desc())
        )
        return list((await db.scalars(stmt)).all())

    async def get_for_sub_and_event(
        self, db: AsyncSession, *, authentik_sub: str, event_id: int
    ) -> Optional[EventParticipation]:
        stmt = select(EventParticipation).where(
            EventParticipation.authentik_sub == authentik_sub,
            EventParticipation.event_id == event_id,
        )
        return (await db.scalars(stmt)).first()

    async def record(
        self,
        db: AsyncSession,
        *,
        authentik_sub: str,
        event_id: int,
        team: Optional[Team],
        is_captain: bool = False,
        commit: bool = True,
    ) -> EventParticipation:
        """Upsert a person's participation in an event, snapshotting the team.

        Idempotent on (authentik_sub, event_id): an existing row is refreshed
        with the latest team snapshot rather than duplicated.
        """
        existing = await self.get_for_sub_and_event(
            db, authentik_sub=authentik_sub, event_id=event_id
        )
        team_id = team.id if team is not None else None
        team_name = team.name if team is not None else None
        team_total = team.total if team is not None else None
        team_classification = team.classification if team is not None else None

        if existing is not None:
            existing.team_id = team_id
            existing.team_name = team_name
            existing.team_total = team_total
            existing.team_classification = team_classification
            existing.is_captain = is_captain
            db.add(existing)
            if commit:
                await db.commit()
                await db.refresh(existing)
            return existing

        row = EventParticipation(
            authentik_sub=authentik_sub,
            event_id=event_id,
            team_id=team_id,
            team_name=team_name,
            team_total=team_total,
            team_classification=team_classification,
            is_captain=is_captain,
        )
        db.add(row)
        if commit:
            await db.commit()
            await db.refresh(row)
        return row


participation = CRUDParticipation()
