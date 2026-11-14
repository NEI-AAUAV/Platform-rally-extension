"""CRUD for per-person event participation history."""

from collections.abc import Sequence

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participation import EventParticipation
from app.models.team import Team


class CRUDParticipation:
    async def get_for_sub(
        self, db: AsyncSession, *, authentik_sub: str
    ) -> Sequence[EventParticipation]:
        """All participations for a person, newest first."""
        stmt = (
            select(EventParticipation)
            .where(EventParticipation.authentik_sub == authentik_sub)
            .order_by(EventParticipation.joined_at.desc())
        )
        return list((await db.scalars(stmt)).all())

    async def get_for_sub_and_event(
        self, db: AsyncSession, *, authentik_sub: str, event_id: int
    ) -> EventParticipation | None:
        stmt = select(EventParticipation).where(
            EventParticipation.authentik_sub == authentik_sub,
            EventParticipation.event_id == event_id,
        )
        return (await db.scalars(stmt)).first()

    async def rekey_sub(self, db: AsyncSession, *, old_sub: str, new_sub: str) -> None:
        """Move participations recorded under ``old_sub`` to ``new_sub``.

        Used when a row was linked under the Authentik uuid but the person logs
        in with a different OIDC subject. Events ``new_sub`` already has a row
        for are left alone (unique on (sub, event)). Does not commit.
        """
        taken = select(EventParticipation.event_id).where(
            EventParticipation.authentik_sub == new_sub
        )
        await db.execute(
            update(EventParticipation)
            .where(
                EventParticipation.authentik_sub == old_sub,
                EventParticipation.event_id.not_in(taken),
            )
            .values(authentik_sub=new_sub)
        )

    async def record(
        self,
        db: AsyncSession,
        *,
        authentik_sub: str,
        event_id: int,
        team: Team | None,
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
