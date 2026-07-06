"""
Critical ABAC (Access Control) tests
"""
import pytest
from fastapi import HTTPException
from unittest.mock import Mock, AsyncMock, patch

from app.core.abac import ABACEngine, Action, Resource, Context
from app.api.abac_deps import require_permission, get_staff_with_checkpoint_access
from app.schemas.user import DetailedUser


@pytest.fixture
def mock_user():
    """Mock user for testing"""
    return DetailedUser(
        id=1,
        name="Test User",
        disabled=False,
        is_captain=False,
        team_id=1
    )


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
        staff_checkpoint_id=1  # Staff user assigned to checkpoint 1
    )


def _context(action: Action, resource: Resource, scopes: list[str], **kwargs) -> Context:
    context = Context(
        user=kwargs.pop("user", Mock(staff_checkpoint_id=None)),
        auth=Mock(scopes=scopes),
        action=action,
        resource=resource,
        **kwargs,
    )
    return context


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

    def test_manager_denied_unlisted_action(self):
        """Rally managers are denied actions not in their table"""
        engine = ABACEngine()
        context = _context(Action.ADD_CHECKPOINT_SCORE, Resource.SCORE, ["manager-rally"])
        assert engine.evaluate(context) is False

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
            Action.ADD_CHECKPOINT_SCORE, Resource.SCORE, ["rally-staff"],
            user=user, checkpoint_id=1,
        )
        assert engine.evaluate(context) is True

    def test_staff_cannot_score_other_checkpoint(self):
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=1)
        context = _context(
            Action.ADD_CHECKPOINT_SCORE, Resource.SCORE, ["rally-staff"],
            user=user, checkpoint_id=2,
        )
        assert engine.evaluate(context) is False

    def test_staff_cannot_score_without_checkpoint_context(self):
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=1)
        context = _context(
            Action.ADD_CHECKPOINT_SCORE, Resource.SCORE, ["rally-staff"],
            user=user, checkpoint_id=None,
        )
        assert engine.evaluate(context) is False

    def test_staff_can_view_activity_results_globally_with_assignment(self):
        """Global results list carries no checkpoint_id; any assigned staff can view"""
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=1)
        context = _context(
            Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT, ["rally-staff"],
            user=user, checkpoint_id=None,
        )
        assert engine.evaluate(context) is True

    def test_staff_without_checkpoint_cannot_view_activity_results(self):
        engine = ABACEngine()
        user = Mock(staff_checkpoint_id=None)
        context = _context(
            Action.VIEW_ACTIVITY_RESULT, Resource.ACTIVITY_RESULT, ["rally-staff"],
            user=user,
        )
        assert engine.evaluate(context) is False

    def test_staff_can_view_activities_unconditionally(self):
        engine = ABACEngine()
        context = _context(Action.VIEW_ACTIVITY, Resource.ACTIVITY, ["rally-staff"])
        assert engine.evaluate(context) is True

    def test_staff_denied_action_outside_table(self):
        """Actions not in the staff table are denied (replaces old default-deny policy)"""
        engine = ABACEngine()
        context = _context(Action.CREATE_CHECKPOINT, Resource.CHECKPOINT, ["rally-staff"])
        assert engine.evaluate(context) is False


class TestABACDependencies:
    """Test ABAC dependency functions"""

    def test_require_permission_success(self, mock_user, mock_auth_data):
        """Test successful permission requirement"""
        with patch('app.core.abac.abac_engine') as mock_engine:
            mock_engine.evaluate.return_value = True

            # This should not raise an exception
            require_permission(
                user=mock_user,
                auth=mock_auth_data,
                action=Action.VIEW_CHECKPOINT_TEAMS,
                resource=Resource.TEAM
            )

            mock_engine.evaluate.assert_called_once()

    def test_require_permission_denied(self, mock_user, mock_auth_data):
        """Test denied permission requirement"""
        with patch('app.core.abac.abac_engine') as mock_engine:
            mock_engine.evaluate.return_value = False

            with pytest.raises(HTTPException):
                require_permission(
                    user=mock_user,
                    auth=mock_auth_data,
                    action=Action.VIEW_CHECKPOINT_TEAMS,
                    resource=Resource.TEAM
                )

    def test_get_staff_with_checkpoint_access_staff_user(self, mock_staff_user, mock_staff_auth_data):
        """Test staff user with checkpoint access"""
        mock_db = AsyncMock()
        with patch('app.crud.crud_rally_staff_assignment.rally_staff_assignment.get_by_user_id') as mock_get_assignment:
            mock_get_assignment.return_value = Mock(checkpoint_id=1)

            result = get_staff_with_checkpoint_access(
                auth=mock_staff_auth_data,
                curr_user=mock_staff_user,
                db=mock_db
            )

            assert result == mock_staff_user

    def test_get_staff_with_checkpoint_access_non_staff(self, mock_user, mock_auth_data):
        """Test non-staff user accessing checkpoint"""
        mock_db = AsyncMock()

        with pytest.raises(HTTPException):
            get_staff_with_checkpoint_access(
                auth=mock_auth_data,
                curr_user=mock_user,
                db=mock_db
            )


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
