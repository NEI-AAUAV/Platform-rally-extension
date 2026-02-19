from typing import Annotated, Generator, List, Optional

from fastapi import Depends, HTTPException, Security
from sqlalchemy.orm import Session

from app import crud
from app.db.session import SessionLocal
from app.models.user import User
from app.schemas.user import DetailedUser, UserCreate
from app.api.auth import AuthData, ScopeEnum, api_nei_auth, api_nei_auth_optional


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    db: Annotated[Session, Depends(get_db)],
) -> DetailedUser:
    user = db.get(User, auth.sub)
    if user is None:
        # Create user with auth.sub as ID (set before commit to avoid primary key modification issues)
        # This is needed for NEI platform compatibility where user IDs must match auth.sub
        user = crud.user.create_with_id(
            db, 
            obj_in=UserCreate(
                name=f"{auth.name} {auth.surname}",
            ),
            user_id=auth.sub
        )
        # Set scopes after creation (User model has this field but schema doesn't)
        # User is already tracked by session after create_with_id, so just update and commit
        user.scopes = auth.scopes
        db.commit()
        db.refresh(user)
    else:
        # Update scopes if they've changed
        if user.scopes != auth.scopes:
            user.scopes = auth.scopes
            db.add(user)
            db.commit()
            db.refresh(user)
    
    # Load staff checkpoint assignment if user is staff
    detailed_user = DetailedUser.model_validate(user)
    if "rally-staff" in auth.scopes:
        from app.crud.crud_rally_staff_assignment import rally_staff_assignment
        staff_assignment = rally_staff_assignment.get_by_user_id(db, auth.sub)
        if staff_assignment:
            detailed_user.staff_checkpoint_id = staff_assignment.checkpoint_id
    
    return detailed_user


def get_current_user_optional(
    auth: Annotated[Optional[AuthData], Security(api_nei_auth_optional, scopes=[])],
    db: Annotated[Session, Depends(get_db)],
) -> Optional[DetailedUser]:
    if not auth:
        return None
    
    user = db.get(User, auth.sub)
    if user is None:
        return None

    # Update scopes if they've changed (Sync with Auth Service)
    if user.scopes != auth.scopes:
        user.scopes = auth.scopes
        db.add(user)
        db.commit()
        db.refresh(user)
        
    # Load staff checkpoint assignment if user is staff
    detailed_user = DetailedUser.model_validate(user)
    if "rally-staff" in auth.scopes:
        from app.crud.crud_rally_staff_assignment import rally_staff_assignment
        staff_assignment = rally_staff_assignment.get_by_user_id(db, auth.sub)
        if staff_assignment:
            detailed_user.staff_checkpoint_id = staff_assignment.checkpoint_id
    
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


def is_admin_or_staff(scopes: List[str]) -> bool:
    return is_admin(scopes) or is_staff(scopes)


def get_admin(
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
) -> DetailedUser:
    if not is_admin(auth.scopes):
        raise HTTPException(status_code=403, detail="User without admin permissions")
    return curr_user


def get_admin_or_staff(
    auth: Annotated[AuthData, Security(api_nei_auth, scopes=[])],
    curr_user: Annotated[DetailedUser, Depends(get_participant)],
) -> DetailedUser:
    if not is_admin(auth.scopes) and curr_user.staff_checkpoint_id is None:
        raise HTTPException(status_code=403, detail="User without permissions")
    return curr_user


from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import settings
from app.schemas.team_auth import TeamTokenData

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
