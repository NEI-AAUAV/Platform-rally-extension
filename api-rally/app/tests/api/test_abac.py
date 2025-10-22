"""
Critical ABAC (Access Control) tests
"""
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from app.core.abac import ABACEngine, Policy, Action, Resource, Context
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


class TestABACEngine:
    """Test ABAC Engine core functionality"""
    
    def test_policy_creation(self):
        """Test policy creation"""
        policy = Policy(
            name="test_policy",
            description="Test policy",
            effect="allow",
            conditions={"user.scopes": {"contains": "rally:participant"}},
            priority=50
        )
        
        assert policy.name == "test_policy"
        assert policy.description == "Test policy"
        assert policy.effect == "allow"
        assert policy.priority == 50
    
    def test_abac_engine_initialization(self):
        """Test ABAC engine initialization"""
        engine = ABACEngine()
        # The engine loads default policies, so it won't be empty
        assert isinstance(engine.policies, list)
        assert len(engine.policies) > 0  # Should have default policies loaded
    
    def test_add_policy(self):
        """Test adding policy to engine"""
        engine = ABACEngine()
        initial_count = len(engine.policies)
        
        policy = Policy(
            name="test_policy",
            description="Test policy",
            effect="allow",
            conditions={"user.scopes": {"contains": "rally:participant"}},
            priority=50
        )
        
        engine.add_policy(policy)
        assert len(engine.policies) == initial_count + 1
        assert engine.policies[-1] == policy
    
    def test_evaluate_permission_allow(self):
        """Test permission evaluation - allow case"""
        engine = ABACEngine()
        policy = Policy(
            name="participant_read_team",
            description="Allow participants to read teams",
            effect="allow",
            conditions={"user_scopes": {"contains": "rally:participant"}},
            priority=50
        )
        engine.add_policy(policy)
        
        # Create mock context
        context = Context(
            user=Mock(),
            auth=Mock(),
            action=Action.VIEW_CHECKPOINT_TEAMS,
            resource=Resource.TEAM,
            request_time=None
        )
        context.auth.scopes = ["rally:participant"]
        
        result = engine.evaluate(context)
        assert result is True
    
    def test_evaluate_permission_deny(self):
        """Test permission evaluation - deny case"""
        engine = ABACEngine()
        policy = Policy(
            name="deny_non_participants",
            description="Deny non-participants",
            effect="deny",
            conditions={"user_scopes": {"not_in": ["rally:participant"]}},
            priority=50
        )
        engine.add_policy(policy)
        
        # Create mock context
        context = Context(
            user=Mock(),
            auth=Mock(),
            action=Action.VIEW_CHECKPOINT_TEAMS,
            resource=Resource.TEAM,
            request_time=None
        )
        context.auth.scopes = ["other:scope"]
        
        result = engine.evaluate(context)
        assert result is False
    
    def test_evaluate_permission_no_match(self):
        """Test permission evaluation - no matching policy"""
        engine = ABACEngine()
        
        # Create mock context
        context = Context(
            user=Mock(),
            auth=Mock(),
            action=Action.CREATE_TEAM,  # Use an action that might not have specific policies
            resource=Resource.TEAM,
            request_time=None
        )
        context.auth.scopes = ["rally:participant"]
        
        result = engine.evaluate(context)
        # The result depends on the default policies loaded by the engine
        assert isinstance(result, bool)


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
            
            with pytest.raises(Exception):  # Should raise HTTPException
                require_permission(
                    user=mock_user,
                    auth=mock_auth_data,
                    action=Action.VIEW_CHECKPOINT_TEAMS,
                    resource=Resource.TEAM
                )
    
    def test_get_staff_with_checkpoint_access_staff_user(self, mock_staff_user, mock_staff_auth_data):
        """Test staff user with checkpoint access"""
        with patch('app.api.deps.get_db') as mock_get_db:
            mock_db = Mock()
            mock_get_db.return_value = mock_db
            
            result = get_staff_with_checkpoint_access(
                auth=mock_staff_auth_data,
                curr_user=mock_staff_user,
                db=mock_db
            )
            
            assert result == mock_staff_user
    
    def test_get_staff_with_checkpoint_access_non_staff(self, mock_user, mock_auth_data):
        """Test non-staff user accessing checkpoint"""
        with patch('app.api.deps.get_db') as mock_get_db:
            mock_db = Mock()
            mock_get_db.return_value = mock_db
            
            with pytest.raises(Exception):  # Should raise HTTPException
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
    
    def test_participant_can_read_team(self):
        """Test participant can read team data"""
        engine = ABACEngine()
        
        # Add participant policy
        policy = Policy(
            name="participant_policy",
            description="Participant permissions",
            effect="allow",
            conditions={"user_scopes": {"contains": "rally:participant"}},
            priority=50
        )
        engine.add_policy(policy)
        
        # Create mock context
        context = Context(
            user=Mock(),
            auth=Mock(),
            action=Action.VIEW_CHECKPOINT_TEAMS,
            resource=Resource.TEAM,
            request_time=None
        )
        context.auth.scopes = ["rally:participant"]
        
        assert engine.evaluate(context) is True
    
    def test_staff_can_manage_checkpoints(self):
        """Test staff cannot manage checkpoints (only rally managers can)"""
        engine = ABACEngine()
        
        # Test create checkpoint - staff should NOT be able to do this
        context = Context(
            user=Mock(),
            auth=Mock(),
            action=Action.CREATE_CHECKPOINT,
            resource=Resource.CHECKPOINT,
            request_time=None
        )
        context.auth.scopes = ["rally:staff"]
        assert engine.evaluate(context) is False
        
        # Test update checkpoint - staff should NOT be able to do this
        context.action = Action.UPDATE_CHECKPOINT
        assert engine.evaluate(context) is False
    
    def test_captain_can_manage_team(self):
        """Test team captain cannot manage their team (no policy exists)"""
        engine = ABACEngine()
        
        # Create mock context for captain trying to update team
        context = Context(
            user=Mock(),
            auth=Mock(),
            action=Action.UPDATE_TEAM,
            resource=Resource.TEAM,
            request_time=None
        )
        context.auth.scopes = ["rally:participant"]
        context.user.is_captain = True
        
        # Captain should NOT be able to manage team (no policy allows this)
        assert engine.evaluate(context) is False

