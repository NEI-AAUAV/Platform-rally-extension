"""Unit tests for the auth dependencies in app.api.deps.

Covers the OIDC user-mirroring paths (create, placeholder backfill, scope
sync, concurrent-creation race) and the team-token dependencies.
"""

from datetime import UTC, datetime, timedelta
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


def _auth(sub="sub-1", email="user@ua.pt", name="User", scopes=None, email_verified=True):
    a = Mock()
    a.oidc_sub = sub
    a.email = email
    a.name = name
    a.scopes = scopes if scopes is not None else []
    a.email_verified = email_verified
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


# ---------- get_db ----------


async def test_get_db_yields_a_session_and_closes():
    """`get_db` is normally bypassed via dependency_overrides in API tests;
    exercise the real generator directly."""
    gen = deps.get_db()
    session = await gen.__anext__()
    assert session is not None
    with pytest.raises(StopAsyncIteration):
        await gen.__anext__()


# ---------- get_current_user ----------


async def test_get_current_user_returns_existing_user():
    db = AsyncMock()
    user = _user()
    with (
        patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=user)),
        patch.object(DetailedUser, "model_validate", return_value=_detailed(user)),
    ):
        result = await deps.get_current_user(_auth(), db)
    assert result.id == 1


async def test_get_current_user_creates_on_first_login():
    db = AsyncMock()
    created = _user(id=9)
    create_mock = AsyncMock(return_value=created)
    with (
        patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=None)),
        patch("app.crud.user.get_by_email", new=AsyncMock(return_value=None)),
        patch("app.crud.user.create_for_oidc", new=create_mock),
        patch.object(DetailedUser, "model_validate", return_value=_detailed(created)),
    ):
        result = await deps.get_current_user(_auth(), db)
    assert result.id == 9
    create_mock.assert_awaited_once()


async def test_get_current_user_backfills_email_placeholder():
    """A placeholder row (no authentik_sub) mirrored from an Authentik group is
    adopted on first login instead of creating a duplicate."""
    db = AsyncMock()
    placeholder = _user(id=5, sub=None)
    with (
        patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=None)),
        patch("app.crud.user.get_by_email", new=AsyncMock(return_value=placeholder)),
        patch("app.crud.user.create_for_oidc", new=AsyncMock()) as create_mock,
        patch.object(DetailedUser, "model_validate", return_value=_detailed(placeholder)),
    ):
        result = await deps.get_current_user(_auth(sub="new-sub"), db)
    assert result.id == 5
    assert placeholder.authentik_sub == "new-sub"
    create_mock.assert_not_awaited()


async def test_get_current_user_skips_email_backfill_when_email_unverified():
    """M12: an unverified email claim must never adopt a pre-mirrored
    placeholder row -- an attacker who merely claims someone else's email at
    the IdP (or an IdP not enforcing verification) must not inherit that
    placeholder's scopes. Falls through to the normal create path instead."""
    db = AsyncMock()
    placeholder = _user(id=5, sub=None)
    created = _user(id=42)
    with (
        patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=None)),
        patch(
            "app.crud.user.get_by_email", new=AsyncMock(return_value=placeholder)
        ) as get_by_email,
        patch("app.crud.user.create_for_oidc", new=AsyncMock(return_value=created)) as create_mock,
        patch.object(DetailedUser, "model_validate", return_value=_detailed(created)),
    ):
        result = await deps.get_current_user(_auth(sub="new-sub", email_verified=False), db)
    assert result.id == 42
    assert placeholder.authentik_sub is None  # never adopted
    get_by_email.assert_not_awaited()
    create_mock.assert_awaited_once()


async def test_get_current_user_survives_creation_race():
    """Two concurrent first logins: the loser's INSERT hits IntegrityError and
    must re-fetch the winner's row instead of failing the request."""
    db = AsyncMock()
    winner = _user(id=3)
    get_by_sub = AsyncMock(side_effect=[None, winner])  # miss, then re-fetch hit
    with (
        patch("app.crud.user.get_by_authentik_sub", new=get_by_sub),
        patch("app.crud.user.get_by_email", new=AsyncMock(return_value=None)),
        patch(
            "app.crud.user.create_for_oidc",
            new=AsyncMock(side_effect=IntegrityError("dup", None, RuntimeError("duplicate key"))),
        ),
        patch.object(DetailedUser, "model_validate", return_value=_detailed(winner)),
    ):
        result = await deps.get_current_user(_auth(), db)
    assert result.id == 3
    db.rollback.assert_awaited()


async def test_get_current_user_skips_email_backfill_without_email():
    """`_adopt_email_placeholder` is a no-op when the auth payload carries no
    email at all -- first-login create path still runs."""
    db = AsyncMock()
    created = _user(id=11)
    get_by_email = AsyncMock()
    with (
        patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=None)),
        patch("app.crud.user.get_by_email", new=get_by_email),
        patch("app.crud.user.create_for_oidc", new=AsyncMock(return_value=created)),
        patch.object(DetailedUser, "model_validate", return_value=_detailed(created)),
    ):
        result = await deps.get_current_user(_auth(email=None), db)
    assert result.id == 11
    get_by_email.assert_not_awaited()


async def test_get_current_user_raises_500_when_race_loser_finds_nothing():
    """Both the initial lookup and the post-IntegrityError re-fetch miss:
    something is badly wrong (e.g. the row was deleted mid-race) -- surfaced
    as a 500 rather than silently returning a null user."""
    db = AsyncMock()
    get_by_sub = AsyncMock(side_effect=[None, None])
    auth_data = _auth()
    with (
        patch("app.crud.user.get_by_authentik_sub", new=get_by_sub),
        patch("app.crud.user.get_by_email", new=AsyncMock(return_value=None)),
        patch(
            "app.crud.user.create_for_oidc",
            new=AsyncMock(side_effect=IntegrityError("dup", None, RuntimeError("duplicate key"))),
        ),
        pytest.raises(HTTPException) as exc,
    ):
        await deps.get_current_user(auth_data, db)
    assert exc.value.status_code == 500


async def test_get_current_user_loads_guide_team_assignment():
    db = AsyncMock()
    user = _user(scopes=["rally-guide"])
    guide_assignment = Mock(team_id=42)
    with (
        patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=user)),
        patch.object(DetailedUser, "model_validate", return_value=_detailed(user)),
        patch(
            "app.crud.crud_rally_guide_assignment.rally_guide_assignment.get_by_user_id",
            new=AsyncMock(return_value=guide_assignment),
        ),
    ):
        result = await deps.get_current_user(_auth(scopes=["rally-guide"]), db)
    assert result.guide_team_id == 42


async def test_get_current_user_syncs_scopes_from_provider():
    db = AsyncMock()
    user = _user(scopes=["old-scope"])
    with (
        patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=user)),
        patch.object(DetailedUser, "model_validate", return_value=_detailed(user)),
        patch(
            "app.crud.crud_rally_staff_assignment.rally_staff_assignment.get_by_user_id",
            new=AsyncMock(return_value=None),
        ),
    ):
        await deps.get_current_user(_auth(scopes=["rally-staff"]), db)
    assert user.scopes == ["rally-staff"]


# ---------- get_current_user_optional ----------


async def test_get_current_user_optional_none_without_auth():
    db = AsyncMock()
    assert await deps.get_current_user_optional(None, db) is None


async def test_get_current_user_optional_none_when_no_matching_user():
    """No existing user and no adoptable placeholder: returns None instead of
    creating a row (unlike the mandatory get_current_user)."""
    db = AsyncMock()
    with (
        patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=None)),
        patch("app.crud.user.get_by_email", new=AsyncMock(return_value=None)),
    ):
        result = await deps.get_current_user_optional(_auth(), db)
    assert result is None


async def test_get_current_user_optional_returns_existing_user():
    db = AsyncMock()
    user = _user()
    with (
        patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=user)),
        patch.object(DetailedUser, "model_validate", return_value=_detailed(user)),
    ):
        result = await deps.get_current_user_optional(_auth(), db)
    assert result.id == 1


async def test_get_current_user_optional_backfills_email_placeholder():
    db = AsyncMock()
    placeholder = _user(id=6, sub=None)
    with (
        patch("app.crud.user.get_by_authentik_sub", new=AsyncMock(return_value=None)),
        patch("app.crud.user.get_by_email", new=AsyncMock(return_value=placeholder)),
        patch.object(DetailedUser, "model_validate", return_value=_detailed(placeholder)),
    ):
        result = await deps.get_current_user_optional(_auth(sub="new-sub"), db)
    assert result.id == 6
    assert placeholder.authentik_sub == "new-sub"


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


def test_get_admin_rejects_staff():
    auth = Mock()
    auth.scopes = ["rally-staff"]
    gate_user = _gate_user(["rally-staff"])
    with pytest.raises(HTTPException) as exc:
        deps.get_admin(auth, gate_user)
    assert exc.value.status_code == 403


def test_get_admin_or_staff_rejects_participant_without_checkpoint():
    auth = Mock()
    auth.scopes = []
    user = _gate_user([])
    with pytest.raises(HTTPException) as exc:
        deps.get_admin_or_staff(auth, user)
    assert exc.value.status_code == 403


def test_get_admin_or_staff_allows_staff_with_checkpoint():
    auth = Mock()
    auth.scopes = ["rally-staff"]
    user = DetailedUser(
        id=1,
        name="U",
        disabled=False,
        team_id=None,
        is_captain=False,
        scopes=["rally-staff"],
        staff_checkpoint_id=3,
    )
    assert deps.get_admin_or_staff(auth, user) is user


def test_get_admin_allows_admin():
    auth = Mock()
    auth.scopes = ["admin"]
    user = _gate_user(["admin"])
    assert deps.get_admin(auth, user) is user


def test_get_participant_rejects_disabled_user():
    user = DetailedUser(id=1, name="U", disabled=True, team_id=None, is_captain=False, scopes=[])
    with pytest.raises(HTTPException) as exc:
        deps.get_participant(user)
    assert exc.value.status_code == 400


# ---------- team-token dependencies ----------


def _team_token(**overrides):
    payload = {
        "team_id": 12,
        "team_name": "Equipa",
        "type": "team_access",
        "exp": datetime.now(UTC) + timedelta(hours=1),
    }
    payload.update(overrides)
    return jwt.encode(payload, settings.TEAM_JWT_SECRET_KEY, algorithm="HS256")


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_team_optional_none_without_credentials():
    assert deps.get_current_team_optional(None, settings) is None


def test_team_optional_valid_token():
    data = deps.get_current_team_optional(_creds(_team_token()), settings)
    assert data is not None
    assert data.team_id == 12
    assert data.team_name == "Equipa"


def test_team_optional_rejects_expired_token():
    token = _team_token(exp=datetime.now(UTC) - timedelta(minutes=1))
    assert deps.get_current_team_optional(_creds(token), settings) is None


def test_team_optional_rejects_wrong_type():
    assert deps.get_current_team_optional(_creds(_team_token(type="other")), settings) is None


def test_team_optional_none_when_secret_key_unconfigured():
    fake_settings = Mock()
    fake_settings.TEAM_JWT_SECRET_KEY = ""
    assert deps.get_current_team_optional(_creds(_team_token()), fake_settings) is None


def test_team_optional_rejects_tampered_signature():
    token = jwt.encode(
        {
            "team_id": 12,
            "team_name": "Equipa",
            "type": "team_access",
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        "wrong-secret",
        algorithm="HS256",
    )
    assert deps.get_current_team_optional(_creds(token), settings) is None


def test_get_current_team_raises_401_without_token():
    with pytest.raises(HTTPException) as exc:
        deps.get_current_team(None)
    assert exc.value.status_code == 401
