"""Unit tests for the auth dependencies in app.api.deps.

Covers the OIDC user-mirroring paths (create, placeholder backfill, scope
sync, concurrent-creation race) and the team-token dependencies.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt
from sqlalchemy.exc import IntegrityError

from app.api import deps
from app.core.config import settings
from app.schemas.user import DetailedUser

pytestmark = pytest.mark.asyncio


def _auth(sub="sub-1", email="user@ua.pt", name="User", scopes=None):
    a = Mock()
    a.oidc_sub = sub
    a.email = email
    a.name = name
    a.scopes = scopes if scopes is not None else []
    return a


def _user(id=1, sub="sub-1", scopes=None, disabled=False):
    u = Mock()
    u.id = id
    u.authentik_sub = sub
    u.name = "User"
    u.email = "user@ua.pt"
    u.scopes = scopes if scopes is not None else []
    u.disabled = disabled
    u.team_id = None
    u.is_captain = False
    u.staff_checkpoint_id = None
    return u


def _detailed(user) -> DetailedUser:
    return DetailedUser(
        id=user.id,
        name=user.name,
        email=user.email,
        disabled=user.disabled,
        team_id=user.team_id,
        is_captain=user.is_captain,
        scopes=list(user.scopes or []),
    )


# ---------- get_current_user ----------


async def test_get_current_user_returns_existing_user():
    db = AsyncMock()
    user = _user()
    with patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=user)), \
         patch.object(DetailedUser, "model_validate", return_value=_detailed(user)):
        result = await deps.get_current_user(_auth(), db)
    assert result.id == 1


async def test_get_current_user_creates_on_first_login():
    db = AsyncMock()
    created = _user(id=9)
    create_mock = AsyncMock(return_value=created)
    with patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=None)), \
         patch("app.crud.user.get_by_email", new=AsyncMock(return_value=None)), \
         patch("app.crud.user.create_for_oidc", new=create_mock), \
         patch.object(DetailedUser, "model_validate", return_value=_detailed(created)):
        result = await deps.get_current_user(_auth(), db)
    assert result.id == 9
    create_mock.assert_awaited_once()


async def test_get_current_user_backfills_email_placeholder():
    """A placeholder row (no authentik_sub) mirrored from an Authentik group is
    adopted on first login instead of creating a duplicate."""
    db = AsyncMock()
    placeholder = _user(id=5, sub=None)
    with patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=None)), \
         patch("app.crud.user.get_by_email", new=AsyncMock(return_value=placeholder)), \
         patch("app.crud.user.create_for_oidc", new=AsyncMock()) as create_mock, \
         patch.object(DetailedUser, "model_validate", return_value=_detailed(placeholder)):
        result = await deps.get_current_user(_auth(sub="new-sub"), db)
    assert result.id == 5
    assert placeholder.authentik_sub == "new-sub"
    create_mock.assert_not_awaited()


async def test_get_current_user_survives_creation_race():
    """Two concurrent first logins: the loser's INSERT hits IntegrityError and
    must re-fetch the winner's row instead of failing the request."""
    db = AsyncMock()
    winner = _user(id=3)
    get_by_sub = AsyncMock(side_effect=[None, winner])  # miss, then re-fetch hit
    with patch("app.crud.user.get_by_authentik_sub", new=get_by_sub), \
         patch("app.crud.user.get_by_email", new=AsyncMock(return_value=None)), \
         patch(
             "app.crud.user.create_for_oidc",
             new=AsyncMock(side_effect=IntegrityError("dup", None, Exception())),
         ), \
         patch.object(DetailedUser, "model_validate", return_value=_detailed(winner)):
        result = await deps.get_current_user(_auth(), db)
    assert result.id == 3
    db.rollback.assert_awaited()


async def test_get_current_user_syncs_scopes_from_provider():
    db = AsyncMock()
    user = _user(scopes=["old-scope"])
    with patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=user)), \
         patch.object(DetailedUser, "model_validate", return_value=_detailed(user)):
        await deps.get_current_user(_auth(scopes=["rally-staff"]), db)
    assert user.scopes == ["rally-staff"]


# ---------- role gates ----------


def _gate_user(scopes):
    return DetailedUser(
        id=1, name="U", disabled=False, team_id=None, is_captain=False, scopes=scopes
    )


@pytest.mark.parametrize(
    "scopes,allowed",
    [
        ([], False),
        (["rally-guide"], True),
        (["rally-staff"], True),
        (["manager-rally"], True),
        (["admin"], True),
    ],
)
async def test_get_guide_gate_matrix(scopes, allowed):
    auth = Mock()
    auth.scopes = scopes
    user = _gate_user(scopes)
    if allowed:
        assert deps.get_guide(auth, user) is user
    else:
        with pytest.raises(HTTPException) as exc:
            deps.get_guide(auth, user)
        assert exc.value.status_code == 403


async def test_get_admin_rejects_staff():
    auth = Mock()
    auth.scopes = ["rally-staff"]
    with pytest.raises(HTTPException) as exc:
        deps.get_admin(auth, _gate_user(["rally-staff"]))
    assert exc.value.status_code == 403


async def test_get_participant_rejects_disabled_user():
    user = DetailedUser(
        id=1, name="U", disabled=True, team_id=None, is_captain=False, scopes=[]
    )
    with pytest.raises(HTTPException) as exc:
        deps.get_participant(user)
    assert exc.value.status_code == 400


# ---------- team-token dependencies ----------


def _team_token(**overrides):
    payload = {
        "team_id": 12,
        "team_name": "Equipa",
        "type": "team_access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    payload.update(overrides)
    return jwt.encode(payload, settings.TEAM_JWT_SECRET_KEY, algorithm="HS256")


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_team_optional_none_without_credentials():
    assert deps.get_current_team_optional(None) is None


def test_team_optional_valid_token():
    data = deps.get_current_team_optional(_creds(_team_token()))
    assert data is not None
    assert data.team_id == 12
    assert data.team_name == "Equipa"


def test_team_optional_rejects_expired_token():
    token = _team_token(exp=datetime.now(timezone.utc) - timedelta(minutes=1))
    assert deps.get_current_team_optional(_creds(token)) is None


def test_team_optional_rejects_wrong_type():
    assert deps.get_current_team_optional(_creds(_team_token(type="other"))) is None


def test_team_optional_rejects_tampered_signature():
    token = jwt.encode(
        {
            "team_id": 12,
            "team_name": "Equipa",
            "type": "team_access",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        "wrong-secret",
        algorithm="HS256",
    )
    assert deps.get_current_team_optional(_creds(token)) is None


def test_get_current_team_raises_401_without_token():
    with pytest.raises(HTTPException) as exc:
        deps.get_current_team(None)
    assert exc.value.status_code == 401
