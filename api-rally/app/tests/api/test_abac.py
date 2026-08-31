"""
Critical ABAC (Access Control) tests
"""

from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException

from app.api.abac_deps import (
    get_staff_with_checkpoint_access,
    require_checkpoint_score_permission,
    require_checkpoint_view_permission,
    require_permission,
    require_view_team_members_permission,
    validate_checkpoint_access,
    validate_settings_update_access,
    validate_settings_view_access,
)
from app.core.abac import (
    _MANAGER_ACTIONS,
    ALL_CHECKPOINTS,
    ABACEngine,
    Action,
    AllCheckpoints,
    Context,
    Resource,
    get_accessible_checkpoints,
)
from app.schemas.user import DetailedUser


@pytest.fixture
def mock_user():
    """Mock user for testing"""
    return DetailedUser(id=1, name="Test User", disabled=False, is_captain=False, team_id=1)


@pytest.fixture
def mock_auth_data():
    """Mock auth data"""
    return Mock(scopes=["rally:participant"])


@pytest.fixture
def mock_staff_auth_data():
    """Mock auth data for staff user"""
    return Mock(scopes=["rally-staff"])


@pytest.fixture
def mock_staff_user():
    """Mock staff user"""
    return DetailedUser(
        id=2,
        name="Staff User",
        disabled=False,
        is_captain=False,
        team_id=None,
        staff_checkpoint_id=1,  # Staff user assigned to checkpoint 1
    )


def _context(action: Action, resource: Resource, scopes: list[str], **kwargs) -> Context:
    return Context(
        user=kwargs.pop("user", Mock(staff_checkpoint_id=None)),
        auth=Mock(scopes=scopes),
        action=action,
        resource=resource,
        **kwargs,
    )


class TestABACEngine:
    """Test ABAC Engine core functionality"""

    def test_admin_has_full_access(self):
        """Admins are allowed any action regardless of resource/context"""
        engine = ABACEngine()
        context = _context(Action.UPDATE_RALLY_SETTINGS, Resource.RALLY_SETTINGS, ["admin"])
        assert engine.evaluate(context) is True

    def test_manager_allowed_action(self):
        """Rally managers are allowed actions in their table"""
        engine = ABACEngine()
        context = _context(Action.VIEW_CHECKPOINT_TEAMS, Resource.TEAM, ["manager-rally"])
        assert engine.evaluate(context) is True

    def test_manager_table_covers_every_action(self):
        """Regression: managers used to be denied the whole scoring/team-
        member family (ADD_CHECKPOINT_SCORE, CREATE_/UPDATE_ACTIVITY_RESULT,
        VIEW_TEAM_MEMBERS) even though `get_staff_with_checkpoint_access`
        already let admin-or-manager callers reach those endpoints — two
        different answers for the same person depending on which check ran.
        Asserting every `Action` has a manager rule keeps a newly-added
        Action from silently falling into the same trap."""
        from app.core.abac import _MANAGER_ACTIONS  # noqa: PLC0415

        missing = [action for action in Action if action not in _MANAGER_ACTIONS]
        assert missing == []

    def test_unknown_scope_denied(self):
        """Unrecognized scopes fall through to default deny"""
        engine = ABACEngine()
        context = _context(Action.VIEW_CHECKPOINT_TEAMS, Resource.TEAM, ["rally:participant"])
        assert engine.evaluate(context) is False

    def test_unauthenticated_denied(self):
        """No scopes at all is denied"""
        engine = ABACEngine()
        context = _context(Action.VIEW_CHECKPOINT_TEAMS, Resource.TEAM, [])
        assert engine.evaluate(context) is False


class TestABACStaffCheckpointScoping:
    """Staff access is scoped to their assigned checkpoint"""

    def test_staff_can_score_own_checkpoint(self):
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=1)
        context = _context(
            Action.ADD_CHECKPOINT_SCORE,
            Resource.SCORE,
            ["rally-staff"],
            user=user,
            checkpoint_id=1,
        )
        assert engine.evaluate(context) is True

    def test_staff_cannot_score_other_checkpoint(self):
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=1)
        context = _context(
            Action.ADD_CHECKPOINT_SCORE,
            Resource.SCORE,
            ["rally-staff"],
            user=user,
            checkpoint_id=2,
        )
        assert engine.evaluate(context) is False

    def test_staff_cannot_score_without_checkpoint_context(self):
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=1)
        context = _context(
            Action.ADD_CHECKPOINT_SCORE,
            Resource.SCORE,
            ["rally-staff"],
            user=user,
            checkpoint_id=None,
        )
        assert engine.evaluate(context) is False

    def test_staff_can_view_activity_results_globally_with_assignment(self):
        """Global results list carries no checkpoint_id; any assigned staff can view"""
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=1)
        context = _context(
            Action.VIEW_ACTIVITY_RESULT,
            Resource.ACTIVITY_RESULT,
            ["rally-staff"],
            user=user,
            checkpoint_id=None,
        )
        assert engine.evaluate(context) is True

    def test_staff_without_checkpoint_cannot_view_activity_results(self):
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=None)
        context = _context(
            Action.VIEW_ACTIVITY_RESULT,
            Resource.ACTIVITY_RESULT,
            ["rally-staff"],
            user=user,
        )
        assert engine.evaluate(context) is False

    def test_staff_can_view_activities_unconditionally(self):
        engine = ABACEngine()
        context = _context(Action.VIEW_ACTIVITY, Resource.ACTIVITY, ["rally-staff"])
        assert engine.evaluate(context) is True

    def test_staff_can_add_team_member_with_assignment(self):
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=1)
        context = _context(Action.ADD_TEAM_MEMBER, Resource.TEAM, ["rally-staff"], user=user)
        assert engine.evaluate(context) is True

    def test_staff_without_checkpoint_cannot_add_team_member(self):
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=None)
        context = _context(Action.ADD_TEAM_MEMBER, Resource.TEAM, ["rally-staff"], user=user)
        assert engine.evaluate(context) is False

    def test_staff_cannot_manage_teams(self):
        """CREATE_TEAM covers team creation, member mutation/removal and OIDC
        directory search — staff get ADD_TEAM_MEMBER only."""
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=1)
        context = _context(Action.CREATE_TEAM, Resource.TEAM, ["rally-staff"], user=user)
        assert engine.evaluate(context) is False

    def test_manager_can_add_team_member(self):
        engine = ABACEngine()
        context = _context(Action.ADD_TEAM_MEMBER, Resource.TEAM, ["manager-rally"])
        assert engine.evaluate(context) is True

    def test_staff_denied_action_outside_table(self):
        """Actions not in the staff table are denied (replaces old default-deny policy)"""
        engine = ABACEngine()
        context = _context(Action.CREATE_CHECKPOINT, Resource.CHECKPOINT, ["rally-staff"])
        assert engine.evaluate(context) is False

    @pytest.mark.parametrize(
        "action",
        [
            Action.ADD_CHECKPOINT_SCORE,
            Action.CREATE_ACTIVITY_RESULT,
            Action.UPDATE_ACTIVITY_RESULT,
            Action.VIEW_TEAM_MEMBERS,
        ],
    )
    def test_manager_allowed_scoring_and_team_member_actions(self, action):
        """Regression: a manager-only user (no rally-staff scope) was 403'd
        here by ABAC while `get_staff_with_checkpoint_access` (the dependency
        actually guarding these endpoints) already let them through — same
        person, two different answers depending on which check ran."""
        engine = ABACEngine()
        context = _context(action, Resource.SCORE, ["manager-rally"])
        assert engine.evaluate(context) is True


class TestABACGuideScope:
    """rally-guide had no table at all, so evaluate() denied any guide
    on an ABAC-protected route regardless of the action requested."""

    def test_guide_allowed_action_in_table(self):
        engine = ABACEngine()
        context = _context(Action.VIEW_ACTIVITY, Resource.ACTIVITY, ["rally-guide"])
        assert engine.evaluate(context) is True

    def test_guide_denied_action_outside_table(self):
        engine = ABACEngine()
        context = _context(Action.UPDATE_RALLY_SETTINGS, Resource.RALLY_SETTINGS, ["rally-guide"])
        assert engine.evaluate(context) is False


class TestABACScopeUnion:
    """Holding a second role must never take permissions away.

    The engine used to be an ordered if-chain that returned on the first table
    matching one of the caller's scopes, so a staff+guide was judged by the
    staff table alone and denied everything the staff rules did not cover.
    """

    @pytest.mark.parametrize("action", [Action.VIEW_CHECKPOINT_TEAMS, Action.VIEW_ACTIVITY_RESULT])
    def test_staff_and_guide_keeps_what_a_plain_guide_has(self, action):
        engine = ABACEngine()
        # No checkpoint assignment: the staff rules for both of these deny,
        # the guide rules allow. The union must allow.
        context = _context(action, Resource.CHECKPOINT, ["rally-staff", "rally-guide"])
        assert engine.evaluate(context) is True

    def test_staff_and_guide_still_denied_outside_both_tables(self):
        engine = ABACEngine()
        context = _context(
            Action.UPDATE_RALLY_SETTINGS, Resource.RALLY_SETTINGS, ["rally-staff", "rally-guide"]
        )
        assert engine.evaluate(context) is False

    def test_manager_does_not_fall_through_to_the_staff_rules(self):
        """An action absent from the manager table is denied on its own terms.

        The manager branch had no ``return`` on a miss, so it fell through to
        be judged by the staff (and then guide) rules — a manager would have
        been checkpoint-scoped by rules written for somebody else.
        """
        engine = ABACEngine()
        with patch.dict(_MANAGER_ACTIONS, clear=False):
            _MANAGER_ACTIONS.pop(Action.VIEW_CHECKPOINT_TEAMS)
            context = _context(Action.VIEW_CHECKPOINT_TEAMS, Resource.CHECKPOINT, ["manager-rally"])
            assert engine.evaluate(context) is False


class TestABACDependencies:
    """Test ABAC dependency functions"""

    def test_require_permission_success(self, mock_user, mock_auth_data):
        """Test successful permission requirement"""
        with patch("app.core.abac.abac_engine") as mock_engine:
            mock_engine.evaluate.return_value = True

            # This should not raise an exception
            require_permission(
                user=mock_user,
                auth=mock_auth_data,
                action=Action.VIEW_CHECKPOINT_TEAMS,
                resource=Resource.TEAM,
            )

            mock_engine.evaluate.assert_called_once()

    def test_require_permission_denied(self, mock_user, mock_auth_data):
        """Test denied permission requirement"""
        with patch("app.core.abac.abac_engine") as mock_engine:
            mock_engine.evaluate.return_value = False

            with pytest.raises(HTTPException):
                require_permission(
                    user=mock_user,
                    auth=mock_auth_data,
                    action=Action.VIEW_CHECKPOINT_TEAMS,
                    resource=Resource.TEAM,
                )

    @pytest.mark.asyncio
    async def test_get_staff_with_checkpoint_access_staff_user(
        self, mock_staff_user, mock_staff_auth_data
    ):
        """Test staff user with checkpoint access.

        The assignment is resolved once, by ``deps.get_current_user``, and
        arrives already on the user — this dependency only checks it is there.
        """
        result = await get_staff_with_checkpoint_access(
            auth=mock_staff_auth_data, curr_user=mock_staff_user
        )

        assert result == mock_staff_user

    @pytest.mark.asyncio
    async def test_get_staff_with_checkpoint_access_non_staff(self, mock_user, mock_auth_data):
        """Test non-staff user accessing checkpoint"""
        with pytest.raises(HTTPException):
            await get_staff_with_checkpoint_access(auth=mock_auth_data, curr_user=mock_user)


class TestActionResourceEnums:
    """Test Action and Resource enums"""

    def test_action_values(self):
        """Test Action enum values"""
        assert Action.ADD_CHECKPOINT_SCORE.value == "add_checkpoint_score"
        assert Action.VIEW_CHECKPOINT_TEAMS.value == "view_checkpoint_teams"
        assert Action.CREATE_CHECKPOINT.value == "create_checkpoint"
        assert Action.UPDATE_CHECKPOINT.value == "update_checkpoint"
        assert Action.CREATE_TEAM.value == "create_team"
        assert Action.UPDATE_TEAM.value == "update_team"
        assert Action.VIEW_RALLY_SETTINGS.value == "view_rally_settings"
        assert Action.UPDATE_RALLY_SETTINGS.value == "update_rally_settings"
        assert Action.CREATE_VERSUS_GROUP.value == "create_versus_group"
        assert Action.VIEW_VERSUS_GROUP.value == "view_versus_group"

    def test_resource_values(self):
        """Test Resource enum values"""
        assert Resource.TEAM.value == "team"
        assert Resource.CHECKPOINT.value == "checkpoint"
        assert Resource.SCORE.value == "score"
        assert Resource.RALLY_SETTINGS.value == "rally_settings"
        assert Resource.VERSUS_GROUP.value == "versus_group"


class TestABACIntegration:
    """Test ABAC integration scenarios"""

    def test_participant_denied_view_team(self):
        """Participants have no ABAC rules of their own (view is gated elsewhere)"""
        engine = ABACEngine()
        context = _context(Action.VIEW_CHECKPOINT_TEAMS, Resource.TEAM, ["rally:participant"])
        assert engine.evaluate(context) is False

    def test_staff_cannot_manage_checkpoints(self):
        """Test staff cannot manage checkpoints (only rally managers can)"""
        engine = ABACEngine()

        context = _context(Action.CREATE_CHECKPOINT, Resource.CHECKPOINT, ["rally:staff"])
        assert engine.evaluate(context) is False

        context.action = Action.UPDATE_CHECKPOINT
        assert engine.evaluate(context) is False

    def test_captain_cannot_manage_team(self):
        """Test team captain cannot manage their team (no rule allows this)"""
        engine = ABACEngine()

        user = Mock(is_captain=True)
        context = _context(Action.UPDATE_TEAM, Resource.TEAM, ["rally:participant"], user=user)

        assert engine.evaluate(context) is False


class TestAccessibleCheckpoints:
    """get_accessible_checkpoints must distinguish all-access from no-access."""

    def test_admin_gets_all_checkpoints_sentinel(self):
        result = get_accessible_checkpoints(Mock(staff_checkpoint_id=None), Mock(scopes=["admin"]))
        assert result is ALL_CHECKPOINTS

    def test_manager_gets_all_checkpoints_sentinel(self):
        result = get_accessible_checkpoints(
            Mock(staff_checkpoint_id=None), Mock(scopes=["manager-rally"])
        )
        assert result is ALL_CHECKPOINTS

    def test_staff_gets_only_assigned_checkpoint(self):
        result = get_accessible_checkpoints(
            Mock(staff_checkpoint_id=7), Mock(scopes=["rally-staff"])
        )
        assert result == [7]

    def test_staff_without_assignment_is_not_all_access(self):
        """Regression: unassigned staff must return an empty list, never the
        ALL_CHECKPOINTS sentinel — otherwise they gain admin-wide access."""
        result = get_accessible_checkpoints(
            Mock(staff_checkpoint_id=None), Mock(scopes=["rally-staff"])
        )
        assert result is not ALL_CHECKPOINTS
        assert result == []

    def test_unknown_scope_is_not_all_access(self):
        result = get_accessible_checkpoints(
            Mock(staff_checkpoint_id=None), Mock(scopes=["rally:participant"])
        )
        assert result is not ALL_CHECKPOINTS
        assert result == []


class TestRequireCheckpointScorePermission:
    """`require_checkpoint_score_permission`, against real Postgres for the
    team/checkpoint order lookups (crud.team.get / crud.checkpoint.get raise
    RallyNotFoundError rather than return None, so the function's own `if not
    team`/`if not checkpoint` guards are unreachable dead code -- not tested)."""

    async def _make_checkpoint(self, pg_session, order=1):
        from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
        from app.schemas.checkpoint import CheckPointCreate

        return await crud_checkpoint.create(
            pg_session, obj_in=CheckPointCreate(name=f"CP{order}", order=order)
        )

    async def _make_team(self, pg_session):
        from app.crud.crud_team import team as crud_team
        from app.schemas.team import TeamCreate

        return await crud_team.create(pg_session, obj_in=TeamCreate(name="Team"))

    async def test_admin_bypasses_order_check(self, pg_session, mock_user):
        """Admins skip the staff-only order validation entirely."""
        from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
        from app.crud.crud_team import team as crud_team

        cp = await self._make_checkpoint(pg_session, order=5)
        team = await self._make_team(pg_session)

        with patch("app.core.abac.abac_engine") as mock_engine:
            mock_engine.evaluate.return_value = True
            # Should not raise despite team not being at checkpoint order 5.
            await require_checkpoint_score_permission(
                checkpoint_id=cp.id,
                team_id=team.id,
                auth=Mock(scopes=["admin"]),
                curr_user=mock_user,
                db=pg_session,
                team_crud=crud_team,
                checkpoint_crud=crud_checkpoint,
            )

    async def test_staff_rejected_when_checkpoint_order_mismatched(
        self, pg_session, mock_staff_user
    ):
        await self._make_checkpoint(pg_session, order=1)
        cp2 = await self._make_checkpoint(pg_session, order=2)
        team = await self._make_team(pg_session)
        # Team hasn't visited any checkpoint yet -> expected_order == 1, but we
        # request scoring at checkpoint order 2.

        checkpoint_id = cp2.id
        team_id = team.id
        auth = Mock(scopes=["rally-staff"])

        from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
        from app.crud.crud_team import team as crud_team

        with pytest.raises(HTTPException) as exc:
            await require_checkpoint_score_permission(
                checkpoint_id=checkpoint_id,
                team_id=team_id,
                auth=auth,
                curr_user=mock_staff_user,
                db=pg_session,
                team_crud=crud_team,
                checkpoint_crud=crud_checkpoint,
            )
        assert exc.value.status_code == 400

    async def test_staff_allowed_when_checkpoint_order_matches(self, pg_session, mock_staff_user):
        from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
        from app.crud.crud_team import team as crud_team

        cp1 = await self._make_checkpoint(pg_session, order=1)
        team = await self._make_team(pg_session)

        with patch("app.core.abac.abac_engine") as mock_engine:
            mock_engine.evaluate.return_value = True
            await require_checkpoint_score_permission(
                checkpoint_id=cp1.id,
                team_id=team.id,
                auth=Mock(scopes=["rally-staff"]),
                curr_user=mock_staff_user,
                db=pg_session,
                team_crud=crud_team,
                checkpoint_crud=crud_checkpoint,
            )
            mock_engine.evaluate.assert_called_once()


class TestRequireCheckpointViewPermission:
    def test_defaults_to_staff_assigned_checkpoint_when_none_given(self, mock_staff_user):
        with patch("app.core.abac.abac_engine") as mock_engine:
            mock_engine.evaluate.return_value = True
            require_checkpoint_view_permission(
                checkpoint_id=None,
                auth=Mock(scopes=["rally-staff"]),
                curr_user=mock_staff_user,
            )
            # staff_checkpoint_id (1) should have been substituted as context.
            (context,), _ = mock_engine.evaluate.call_args
            assert context.checkpoint_id == 1


class TestRequireViewTeamMembersPermission:
    def test_admin_bypasses_permission_check(self, mock_user):
        with patch("app.core.abac.abac_engine") as mock_engine:
            require_view_team_members_permission(auth=Mock(scopes=["admin"]), curr_user=mock_user)
            mock_engine.evaluate.assert_not_called()

    def test_non_admin_goes_through_permission_check(self, mock_user):
        with patch("app.core.abac.abac_engine") as mock_engine:
            mock_engine.evaluate.return_value = True
            require_view_team_members_permission(
                auth=Mock(scopes=["rally:participant"]), curr_user=mock_user
            )
            mock_engine.evaluate.assert_called_once()


class TestValidateCheckpointAccess:
    def test_all_checkpoints_requires_explicit_id(self):
        user = Mock(staff_checkpoint_id=None)
        auth = Mock(scopes=["admin"])
        with patch("app.api.abac_deps.get_accessible_checkpoints", return_value=AllCheckpoints()):
            with pytest.raises(HTTPException) as exc:
                validate_checkpoint_access(
                    user=user,
                    auth=auth,
                    requested_checkpoint_id=None,
                )
            assert exc.value.status_code == 400

    def test_all_checkpoints_returns_requested_id(self):
        user = Mock(staff_checkpoint_id=None)
        auth = Mock(scopes=["admin"])
        with patch("app.api.abac_deps.get_accessible_checkpoints", return_value=AllCheckpoints()):
            result = validate_checkpoint_access(
                user=user,
                auth=auth,
                requested_checkpoint_id=42,
            )
            assert result == 42

    def test_staff_without_request_or_assignment_raises(self):
        user = Mock(staff_checkpoint_id=None)
        auth = Mock(scopes=["rally-staff"])
        with patch("app.api.abac_deps.get_accessible_checkpoints", return_value=[]):
            with pytest.raises(HTTPException) as exc:
                validate_checkpoint_access(
                    user=user,
                    auth=auth,
                    requested_checkpoint_id=None,
                )
            assert exc.value.status_code == 400

    def test_staff_without_request_uses_assigned_checkpoint(self):
        user = Mock(staff_checkpoint_id=7)
        auth = Mock(scopes=["rally-staff"])
        with patch("app.api.abac_deps.get_accessible_checkpoints", return_value=[7]):
            result = validate_checkpoint_access(
                user=user,
                auth=auth,
                requested_checkpoint_id=None,
            )
            assert result == 7

    def test_staff_requesting_inaccessible_checkpoint_denied(self):
        user = Mock(staff_checkpoint_id=7)
        auth = Mock(scopes=["rally-staff"])
        with patch("app.api.abac_deps.get_accessible_checkpoints", return_value=[7]):
            with pytest.raises(HTTPException) as exc:
                validate_checkpoint_access(
                    user=user,
                    auth=auth,
                    requested_checkpoint_id=999,
                )
            assert exc.value.status_code == 403

    def test_staff_requesting_accessible_checkpoint_allowed(self):
        user = Mock(staff_checkpoint_id=7)
        auth = Mock(scopes=["rally-staff"])
        with patch("app.api.abac_deps.get_accessible_checkpoints", return_value=[7]):
            result = validate_checkpoint_access(
                user=user,
                auth=auth,
                requested_checkpoint_id=7,
            )
            assert result == 7


class TestValidateSettingsUpdateAccess:
    def test_allowed(self, mock_user, mock_auth_data):
        with patch("app.api.abac_deps.check_permission", return_value=True):
            assert validate_settings_update_access(mock_user, mock_auth_data) is True

    def test_denied_raises_403(self, mock_user, mock_auth_data):
        with patch("app.api.abac_deps.check_permission", return_value=False):
            with pytest.raises(HTTPException) as exc:
                validate_settings_update_access(mock_user, mock_auth_data)
            assert exc.value.status_code == 403


class TestValidateSettingsViewAccess:
    def test_allowed(self, mock_user, mock_auth_data):
        with patch("app.api.abac_deps.check_permission", return_value=True):
            assert validate_settings_view_access(mock_user, mock_auth_data) is True

    def test_denied_raises_403(self, mock_user, mock_auth_data):
        with patch("app.api.abac_deps.check_permission", return_value=False):
            with pytest.raises(HTTPException) as exc:
                validate_settings_view_access(mock_user, mock_auth_data)
            assert exc.value.status_code == 403
