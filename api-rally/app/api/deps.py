import logging
from collections.abc import AsyncGenerator
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.api.auth import AuthData, ScopeEnum, api_nei_auth, api_nei_auth_optional
from app.core.config import Settings, SettingsDep
from app.core.exceptions import RallyUnauthorizedError
from app.crud.crud_rally_guide_assignment import rally_guide_assignment
from app.crud.crud_rally_staff_assignment import rally_staff_assignment
from app.db.session import SessionLocal
from app.schemas.team_auth import TeamTokenData
from app.schemas.user import DetailedUser
from app.services.team_auth_service import validate_team_token

logger = logging.getLogger(__name__)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as db:
        yield db


SessionDep = Annotated[AsyncSession, Depends(get_db)]


async def _adopt_email_placeholder(
    db: AsyncSession, auth: AuthData, settings: Settings
) -> Any | None:
    """Backfill: an email-matched placeholder mirrored eagerly from an
    Authentik group (e.g. rally-staff) may exist before this first login.

    Skipping this creates a *second* user row for the same person, and since
    ``rally_staff_assignment.user_id`` is not an FK, their checkpoint stays
    attached to the placeholder — the new row shows up unassigned.

    Linking on an unverified email is only safe while the IdP does not allow
    someone to register with an arbitrary address: otherwise an attacker could
    inherit a pre-mirrored placeholder's scopes by claiming its email. Authentik
    omits ``email_verified`` unless the provider's scope mapping emits it, so
    ``OIDC_TRUST_UNVERIFIED_EMAIL`` decides which risk a deployment takes.
    """
    if not auth.email:
        return None
    if not auth.email_verified and not settings.OIDC_TRUST_UNVERIFIED_EMAIL:
        logger.warning(
            "Refusing to adopt a mirrored placeholder for sub=%s: the token carries no "
            "email_verified claim and OIDC_TRUST_UNVERIFIED_EMAIL is off. A duplicate user "
            "row will be created instead.",
            auth.oidc_sub,
        )
        return None
    placeholder = await crud.user.get_by_email(db, email=auth.email)
    if placeholder is None or placeholder.authentik_sub is not None:
        return None
    placeholder.authentik_sub = auth.oidc_sub
    placeholder.name = auth.name
    placeholder.scopes = auth.scopes
    db.add(placeholder)
    await db.commit()
    await db.refresh(placeholder)
    return placeholder


async def _sync_scopes(db: AsyncSession, user: Any, auth: AuthData) -> None:
    if user.scopes == auth.scopes:
        return
    user.scopes = auth.scopes
    db.add(user)
    await db.commit()
    await db.refresh(user)


async def _load_checkpoint_assignments(
    db: AsyncSession, user_id: int, scopes: list[str], detailed_user: DetailedUser
) -> None:
    """Resolve this request's assignments from the assignment tables.

    Both fields are cleared first. ``users.staff_checkpoint_id`` is a
    persisted column that ``DetailedUser.model_validate`` has already copied
    in, and it is never rewritten when someone's staff group is revoked in
    Authentik — so a user who lost the scope kept a truthy value and went on
    passing every gate that tested the *field* instead of the scope. The
    request's scopes are the authority; the column is only a cache.
    """
    detailed_user.staff_checkpoint_id = None
    detailed_user.guide_team_id = None
    if ScopeEnum.RALLY_STAFF in scopes:
        staff_assignment = await rally_staff_assignment.get_by_user_id(db, user_id)
        if staff_assignment:
            detailed_user.staff_checkpoint_id = staff_assignment.checkpoint_id
    if ScopeEnum.RALLY_GUIDE in scopes:
        guide_assignment = await rally_guide_assignment.get_by_user_id(db, user_id)
        if guide_assignment:
            detailed_user.guide_team_id = guide_assignment.team_id


async def get_current_user(
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: SettingsDep,
) -> DetailedUser:
    user = await crud.user.get_by_authentik_sub(db, authentik_sub=auth.oidc_sub)
    if user is None:
        user = await _adopt_email_placeholder(db, auth, settings)

    if user is None:
        # First login: mirror the authentik identity into a local user row.
        # Two concurrent first requests can race on the insert; the loser
        # re-fetches the row the winner created. The unique email index can
        # also reject the insert when a row for this address already exists
        # and adoption declined it — retry by email so the request survives.
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
            if user is None and auth.email:
                user = await crud.user.get_by_email(db, email=auth.email)
            if user is None:
                raise HTTPException(status_code=500, detail="Failed to initialise user") from None
    else:
        await _sync_scopes(db, user, auth)

    detailed_user = DetailedUser.model_validate(user)
    await _load_checkpoint_assignments(db, user.id, auth.scopes, detailed_user)
    return detailed_user


async def get_current_user_optional(
    auth: Annotated[AuthData | None, Security(api_nei_auth_optional, scopes=[])],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: SettingsDep,
) -> DetailedUser | None:
    if not auth:
        return None

    user = await crud.user.get_by_authentik_sub(db, authentik_sub=auth.oidc_sub)
    if user is None:
        user = await _adopt_email_placeholder(db, auth, settings)
    if user is None:
        return None

    await _sync_scopes(db, user, auth)

    detailed_user = DetailedUser.model_validate(user)
    await _load_checkpoint_assignments(db, user.id, auth.scopes, detailed_user)
    return detailed_user


def get_participant(
    curr_user: Annotated[DetailedUser, Depends(get_current_user)],
) -> DetailedUser:
    if curr_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return curr_user


def is_admin_or_manager(scopes: list[str]) -> bool:
    """True for either the ``admin`` or ``manager-rally`` scope.

    named ``is_admin`` for most of this codebase's history, which read as
    "true admin only" at every call site — misleading when auditing who can
    reach a given branch. ``is_admin`` is kept below as a deprecated alias so
    nothing breaks; new code should call this name.
    """
    return any(scope in [ScopeEnum.MANAGER_RALLY, ScopeEnum.ADMIN] for scope in scopes)


# Deprecated alias — see is_admin_or_manager's docstring. Prefer the new name.
is_admin = is_admin_or_manager


def is_staff(scopes: list[str]) -> bool:
    return ScopeEnum.RALLY_STAFF in scopes


def is_guide(scopes: list[str]) -> bool:
    return ScopeEnum.RALLY_GUIDE in scopes


def is_admin_or_staff(scopes: list[str]) -> bool:
    return is_admin(scopes) or is_staff(scopes)


def is_admin_staff_or_guide(scopes: list[str]) -> bool:
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
    """Admin/manager, or staff who actually hold an assignment.

    The scope is checked first and is not optional. This used to pass on
    ``staff_checkpoint_id is not None`` alone, which is a data test, not a
    permission test: it admitted anyone the column still had a value for,
    including a user whose staff group had since been revoked.
    """
    if is_admin(auth.scopes):
        return curr_user
    if is_staff(auth.scopes) and curr_user.staff_checkpoint_id is not None:
        return curr_user
    raise HTTPException(status_code=403, detail="User without permissions")


team_security_optional = HTTPBearer(auto_error=False)


async def get_current_team_optional(
    token: Annotated[HTTPAuthorizationCredentials | None, Depends(team_security_optional)],
    settings: SettingsDep,
    db: SessionDep,
) -> TeamTokenData | None:
    """Dependency for optional team authentication"""
    if not token:
        return None

    try:
        if not settings.TEAM_JWT_SECRET_KEY:
            return None

        return await validate_team_token(db, token.credentials)
    except (JWTError, HTTPException, RallyUnauthorizedError):
        return None


def get_current_team(
    team: Annotated[TeamTokenData | None, Depends(get_current_team_optional)],
) -> TeamTokenData:
    """Dependency requiring a valid team token; 401 otherwise."""
    if team is None:
        raise HTTPException(status_code=401, detail="Team authentication required")
    return team
