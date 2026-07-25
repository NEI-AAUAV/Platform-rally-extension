"""Per-person profile & participation-history endpoints.

A profile is anchored on the caller's OIDC identity (authentik_sub). It lists
the events they took part in across editions. A name-only team member can be
"claimed" by an OIDC login, which moves that team membership onto the caller's
account and records a participation.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import AuthData, api_nei_auth
from app.api.deps import get_db, get_participant
from app.schemas.profile import ClaimableTeam, ParticipationEntry, ProfileResponse
from app.schemas.user import DetailedUser
from app.services.profile_service import ProfileService

router = APIRouter()


@router.get("/profile/me")
async def get_my_profile(
    db: Annotated[AsyncSession, Depends(get_db)],
    _curr: Annotated[DetailedUser, Depends(get_participant)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> ProfileResponse:
    """Return the caller's profile and participation history.

    If the caller is themselves currently on a team, their participation in the
    current event is recorded lazily so the active edition always shows.
    """
    service = ProfileService(db)
    me = await service.get_self(auth)
    await service.record_current_participation_if_on_team(me, auth)
    participations = await service.get_participation_history(auth)

    return ProfileResponse(
        authentik_sub=auth.oidc_sub,
        name=me.name if me else auth.name,
        email=me.email if me else auth.email,
        scopes=auth.scopes,
        current_team_id=me.team_id if me else None,
        participations=participations,
    )


@router.get("/profile/history")
async def get_my_history(
    db: Annotated[AsyncSession, Depends(get_db)],
    _curr: Annotated[DetailedUser, Depends(get_participant)],
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> list[ParticipationEntry]:
    """List the caller's past participations (newest first)."""
    return await ProfileService(db).get_participation_history(auth)


@router.get("/profile/claimable")
async def get_claimable_members(
    access_code: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _curr: Annotated[DetailedUser, Depends(get_participant)],
    _auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
) -> ClaimableTeam:
    """List a team's name-only members (by access code) the caller can claim.

    The caller enters their team's access code; this returns the placeholder
    members (no linked account) so they can pick which one is them and claim it.
    """
    return await ProfileService(db).get_claimable_team(access_code)


@router.post("/profile/claim/{member_user_id}", status_code=201)
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
    return await ProfileService(db).claim_membership(member_user_id, auth)
