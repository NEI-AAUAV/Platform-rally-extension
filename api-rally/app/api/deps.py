from typing import Annotated, AsyncGenerator, List, Optional

from fastapi import Depends, HTTPException, Security
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

from app import crud
from app.crud.crud_rally_staff_assignment import rally_staff_assignment
from app.crud.crud_rally_guide_assignment import rally_guide_assignment
from app.db.session import SessionLocal
from app.schemas.user import DetailedUser
from app.api.auth import AuthData, ScopeEnum, api_nei_auth, api_nei_auth_optional
from app.core.config import settings
from app.schemas.team_auth import TeamTokenData


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as db:
        yield db


async def get_current_user(
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DetailedUser:
    user = await crud.user.get_by_authentik_sub(db, authentik_sub=auth.oidc_sub)
    if user is None and auth.email:
        # May already exist as an email-matched placeholder mirrored eagerly
        # from an Authentik group (e.g. rally-staff) before this first login.
        placeholder = await crud.user.get_by_email(db, email=auth.email)
        if placeholder is not None and placeholder.authentik_sub is None:
            user = placeholder
            user.authentik_sub = auth.oidc_sub
            user.name = auth.name
            user.scopes = auth.scopes
            db.add(user)
            await db.commit()
            await db.refresh(user)
    if user is None:
        # First login: mirror the authentik identity into a local user row.
        # Two concurrent first requests can race on the insert; the loser
        # re-fetches the row the winner created.
        try:
            user = await crud.user.create_for_oidc(
                db,
                authentik_sub=auth.oidc_sub,
                name=auth.name,
                email=auth.email,
                scopes=auth.scopes,
            )
        except IntegrityError:
            await db.rollback()
            user = await crud.user.get_by_authentik_sub(db, authentik_sub=auth.oidc_sub)
            if user is None:
                raise HTTPException(status_code=500, detail="Failed to initialise user")
    elif user.scopes != auth.scopes:
        # Keep local scopes in sync with the identity provider.
        user.scopes = auth.scopes
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Load staff checkpoint assignment if user is staff
    detailed_user = DetailedUser.model_validate(user)
    if "rally-staff" in auth.scopes:
        staff_assignment = await rally_staff_assignment.get_by_user_id(db, user.id)
        if staff_assignment:
            detailed_user.staff_checkpoint_id = staff_assignment.checkpoint_id
    if "rally-guide" in auth.scopes:
        guide_assignment = await rally_guide_assignment.get_by_user_id(db, user.id)
        if guide_assignment:
            detailed_user.guide_checkpoint_id = guide_assignment.checkpoint_id

    return detailed_user


async def get_current_user_optional(
    auth: Annotated[Optional[AuthData], Security(api_nei_auth_optional, scopes=[])],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Optional[DetailedUser]:
    if not auth:
        return None

    user = await crud.user.get_by_authentik_sub(db, authentik_sub=auth.oidc_sub)
    if user is None and auth.email:
        # Same placeholder backfill as get_current_user: an email-matched row
        # mirrored from an Authentik group may exist before first login.
        placeholder = await crud.user.get_by_email(db, email=auth.email)
        if placeholder is not None and placeholder.authentik_sub is None:
            user = placeholder
            user.authentik_sub = auth.oidc_sub
            user.name = auth.name
            user.scopes = auth.scopes
            db.add(user)
            await db.commit()
            await db.refresh(user)
    if user is None:
        return None

    # Update scopes if they've changed (sync with identity provider)
    if user.scopes != auth.scopes:
        user.scopes = auth.scopes
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Load staff checkpoint assignment if user is staff
    detailed_user = DetailedUser.model_validate(user)
    if "rally-staff" in auth.scopes:
        staff_assignment = await rally_staff_assignment.get_by_user_id(db, user.id)
        if staff_assignment:
            detailed_user.staff_checkpoint_id = staff_assignment.checkpoint_id
    if "rally-guide" in auth.scopes:
        guide_assignment = await rally_guide_assignment.get_by_user_id(db, user.id)
        if guide_assignment:
            detailed_user.guide_checkpoint_id = guide_assignment.checkpoint_id

    return detailed_user


def get_participant(
    curr_user: Annotated[DetailedUser, Depends(get_current_user)],
) -> DetailedUser:
    if curr_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return curr_user


def is_admin(scopes: List[str]) -> bool:
    return any(scope in [ScopeEnum.MANAGER_RALLY, ScopeEnum.ADMIN] for scope in scopes)


def is_staff(scopes: List[str]) -> bool:
    return ScopeEnum.RALLY_STAFF in scopes


def is_guide(scopes: List[str]) -> bool:
    return ScopeEnum.RALLY_GUIDE in scopes


def is_admin_or_staff(scopes: List[str]) -> bool:
    return is_admin(scopes) or is_staff(scopes)


def is_admin_staff_or_guide(scopes: List[str]) -> bool:
    return is_admin(scopes) or is_staff(scopes) or is_guide(scopes)


def get_admin(
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
) -> DetailedUser:
    if not is_admin(auth.scopes):
        raise HTTPException(status_code=403, detail="User without admin permissions")
    return curr_user


def get_guide(
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
) -> DetailedUser:
    if not is_admin_staff_or_guide(auth.scopes):
        raise HTTPException(status_code=403, detail="Guide, staff, or admin access required")
    return curr_user


def get_admin_or_staff(
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
) -> DetailedUser:
    if not is_admin(auth.scopes) and curr_user.staff_checkpoint_id is None:
        raise HTTPException(status_code=403, detail="User without permissions")
    return curr_user


team_security_optional = HTTPBearer(auto_error=False)


def get_current_team_optional(
    token: Annotated[Optional[HTTPAuthorizationCredentials], Depends(team_security_optional)],
) -> Optional[TeamTokenData]:
    """Dependency for optional team authentication"""
    if not token:
        return None

    try:
        if not settings.TEAM_JWT_SECRET_KEY:
            return None
            
        payload = jwt.decode(
            token.credentials,
            settings.TEAM_JWT_SECRET_KEY,
            algorithms=[settings.TEAM_JWT_ALGORITHM],
        )
        
        team_id = payload.get("team_id")
        team_name = payload.get("team_name")
        token_type = payload.get("type")
        
        if team_id is None or team_name is None or token_type != "team_access":
            return None
            
        return TeamTokenData(team_id=team_id, team_name=team_name)
    except JWTError:
        return None


def get_current_team(
    team: Annotated[Optional[TeamTokenData], Depends(get_current_team_optional)],
) -> TeamTokenData:
    """Dependency requiring a valid team token; 401 otherwise."""
    if team is None:
        raise HTTPException(
            status_code=401, detail="Team authentication required"
        )
    return team
