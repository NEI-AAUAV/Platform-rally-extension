"""Per-person profile & participation-history endpoints.

A profile is anchored on the caller's OIDC identity (authentik_sub). It lists
the events they took part in across editions. A name-only team member can be
"claimed" by an OIDC login, which moves that team membership onto the caller's
account and records a participation.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Security
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.models.participation import EventParticipation
from app.models.team import Team
from app.models.user import User
from app.schemas.profile import ParticipationEntry, ProfileResponse
from app.schemas.user import DetailedUser

router = APIRouter()


async def _entry(db: AsyncSession, row: EventParticipation) -> ParticipationEntry:
    """Build a participation entry, preferring live team values over snapshots."""
    event = await crud.rally_event.get(db, row.event_id)
    team = await db.get(Team, row.team_id) if row.team_id is not None else None
    return ParticipationEntry(
        event_id=row.event_id,
        event_name=event.name if event else (row.team_name or "Evento"),
        event_type=event.event_type if event else "generic",
        team_id=row.team_id,
        team_name=team.name if team else row.team_name,
        team_total=team.total if team else row.team_total,
        team_classification=team.classification if team else row.team_classification,
        is_captain=row.is_captain,
        joined_at=row.joined_at,
    )


async def _self_user(db: AsyncSession, auth: AuthData) -> User | None:
    return await crud.user.get_by_authentik_sub(db, authentik_sub=auth.oidc_sub)


@router.get("/profile/me", response_model=ProfileResponse)
async def get_my_profile(
    db: Annotated[AsyncSession, Depends(get_db)],
    _curr: Annotated[DetailedUser, Depends(get_participant)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> ProfileResponse:
    """Return the caller's profile and participation history.

    If the caller is themselves currently on a team, their participation in the
    current event is recorded lazily so the active edition always shows.
    """
    me = await _self_user(db, auth)

    # Lazily record current participation when the caller is directly on a team.
    if me is not None and me.team_id is not None:
        team = await db.get(Team, me.team_id)
        if team is not None:
            await crud.participation.record(
                db,
                authentik_sub=auth.oidc_sub,
                event_id=team.event_id or (await crud.rally_event.ensure_current(db)).id,
                team=team,
                is_captain=bool(me.is_captain),
            )

    rows = await crud.participation.get_for_sub(db, authentik_sub=auth.oidc_sub)
    participations = [await _entry(db, r) for r in rows]

    return ProfileResponse(
        authentik_sub=auth.oidc_sub,
        name=me.name if me else auth.name,
        email=me.email if me else auth.email,
        scopes=auth.scopes,
        current_team_id=me.team_id if me else None,
        participations=participations,
    )


@router.get("/profile/history", response_model=list[ParticipationEntry])
async def get_my_history(
    db: Annotated[AsyncSession, Depends(get_db)],
    _curr: Annotated[DetailedUser, Depends(get_participant)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> list[ParticipationEntry]:
    """List the caller's past participations (newest first)."""
    rows = await crud.participation.get_for_sub(db, authentik_sub=auth.oidc_sub)
    return [await _entry(db, r) for r in rows]


@router.post("/profile/claim/{member_user_id}", response_model=ParticipationEntry, status_code=201)
async def claim_membership(
    member_user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _curr: Annotated[DetailedUser, Depends(get_participant)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> ParticipationEntry:
    """Claim a name-only team member as the caller's own participation.

    The placeholder member (a ``user`` row with no authentik_sub) is merged into
    the caller's account: its team membership moves to the caller and the
    placeholder is removed. A participation row is recorded for the event.
    """
    member = await db.get(User, member_user_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.authentik_sub is not None:
        raise HTTPException(status_code=400, detail="This member is already linked to an account")
    if member.team_id is None:
        raise HTTPException(status_code=400, detail="This member is not on a team")

    team = await db.get(Team, member.team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    me = await _self_user(db, auth)
    if me is None:
        # First login may not have created the row yet; create it now.
        me = await crud.user.create_for_oidc(
            db,
            authentik_sub=auth.oidc_sub,
            name=auth.name,
            email=auth.email,
            scopes=auth.scopes,
        )

    # Move the team membership onto the caller, drop the placeholder.
    me.team_id = member.team_id
    me.is_captain = bool(member.is_captain)
    db.add(me)
    await db.delete(member)
    await db.flush()

    row = await crud.participation.record(
        db,
        authentik_sub=auth.oidc_sub,
        event_id=team.event_id or (await crud.rally_event.ensure_current(db)).id,
        team=team,
        is_captain=bool(me.is_captain),
        commit=False,
    )
    await db.commit()
    await db.refresh(row)
    return await _entry(db, row)
