"""
Critical ABAC (Access Control) tests
"""
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from app.core.abac import ABACEngine, Policy, Action, Resource
from app.api.abac_deps import require_permission, get_staff_with_checkpoint_access
from app.schemas.user import DetailedUser


@pytest.fixture
def mock_user():
    """Mock user for testing"""
    return DetailedUser(
        id=1,
        name="Test User",
        email="test@example.com",
        is_captain=False,
        team_id=1,
        scopes=["rally:participant"]
    )


@pytest.fixture
def mock_auth_data():
    """Mock auth data"""
    return Mock(scopes=["rally:participant"])


@pytest.fixture
def mock_staff_user():
    """Mock staff user"""
    return DetailedUser(
        id=2,
        name="Staff User",
        email="staff@example.com",
        is_captain=False,
        team_id=None,
        scopes=["rally:staff"]
    )


class TestABACEngine:
    """Test ABAC Engine core functionality"""
    
    def test_policy_creation(self):
        """Test policy creation"""
        policy = Policy(
            name="test_policy",
            description="Test policy",
            rules=[
                {
                    "effect": "allow",
                    "action": "read",
                    "resource": "team",
                    "condition": {"user.scopes": {"contains": "rally:participant"}}
                }
            ]
        )
        
        assert policy.name == "test_policy"
        assert policy.description == "Test policy"
        assert len(policy.rules) == 1
    
    def test_abac_engine_initialization(self):
        """Test ABAC engine initialization"""
        engine = ABACEngine()
        assert engine.policies == []
        assert engine.context == {}
    
    def test_add_policy(self):
        """Test adding policy to engine"""
        engine = ABACEngine()
        policy = Policy(
            name="test_policy",
            description="Test policy",
            rules=[]
        )
        
        engine.add_policy(policy)
        assert len(engine.policies) == 1
        assert engine.policies[0] == policy
    
    def test_evaluate_permission_allow(self):
        """Test permission evaluation - allow case"""
        engine = ABACEngine()
        policy = Policy(
            name="participant_read_team",
            description="Allow participants to read teams",
            rules=[
                {
                    "effect": "allow",
                    "action": "read",
                    "resource": "team",
                    "condition": {"user.scopes": {"contains": "rally:participant"}}
                }
            ]
        )
        engine.add_policy(policy)
        
        context = {
            "user": {"scopes": ["rally:participant"]},
            "action": "read",
            "resource": "team"
        }
        
        result = engine.evaluate_permission(context)
        assert result is True
    
    def test_evaluate_permission_deny(self):
        """Test permission evaluation - deny case"""
        engine = ABACEngine()
        policy = Policy(
            name="deny_non_participants",
            description="Deny non-participants",
            rules=[
                {
                    "effect": "deny",
                    "action": "read",
                    "resource": "team",
                    "condition": {"user.scopes": {"not_contains": "rally:participant"}}
                }
            ]
        )
        engine.add_policy(policy)
        
        context = {
            "user": {"scopes": ["other:scope"]},
            "action": "read",
            "resource": "team"
        }
        
        result = engine.evaluate_permission(context)
        assert result is False
    
    def test_evaluate_permission_no_match(self):
        """Test permission evaluation - no matching policy"""
        engine = ABACEngine()
        
        context = {
            "user": {"scopes": ["rally:participant"]},
            "action": "delete",
            "resource": "team"
        }
        
        result = engine.evaluate_permission(context)
        assert result is False  # Default deny


class TestABACDependencies:
    """Test ABAC dependency functions"""
    
    def test_require_permission_success(self, mock_user, mock_auth_data):
        """Test successful permission requirement"""
        with patch('app.core.abac.abac_engine') as mock_engine:
            mock_engine.evaluate_permission.return_value = True
            
            # This should not raise an exception
            require_permission(
                user=mock_user,
                auth=mock_auth_data,
                action=Action.READ,
                resource=Resource.TEAM
            )
            
            mock_engine.evaluate_permission.assert_called_once()
    
    def test_require_permission_denied(self, mock_user, mock_auth_data):
        """Test denied permission requirement"""
        with patch('app.core.abac.abac_engine') as mock_engine:
            mock_engine.evaluate_permission.return_value = False
            
            with pytest.raises(Exception):  # Should raise HTTPException
                require_permission(
                    user=mock_user,
                    auth=mock_auth_data,
                    action=Action.DELETE,
                    resource=Resource.TEAM
                )
    
    def test_get_staff_with_checkpoint_access_staff_user(self, mock_staff_user, mock_auth_data):
        """Test staff user with checkpoint access"""
        with patch('app.api.deps.get_db') as mock_get_db:
            mock_db = Mock()
            mock_get_db.return_value = mock_db
            
            result = get_staff_with_checkpoint_access(
                auth=mock_auth_data,
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
        assert Action.READ == "read"
        assert Action.CREATE == "create"
        assert Action.UPDATE == "update"
        assert Action.DELETE == "delete"
        assert Action.CREATE_VERSUS_GROUP == "create_versus_group"
    
    def test_resource_values(self):
        """Test Resource enum values"""
        assert Resource.TEAM == "team"
        assert Resource.CHECKPOINT == "checkpoint"
        assert Resource.VERSUS_GROUP == "versus_group"
        assert Resource.RALLY_SETTINGS == "rally_settings"
        assert Resource.USER == "user"


class TestABACIntegration:
    """Test ABAC integration scenarios"""
    
    def test_participant_can_read_team(self):
        """Test participant can read team data"""
        engine = ABACEngine()
        
        # Add participant policy
        policy = Policy(
            name="participant_policy",
            description="Participant permissions",
            rules=[
                {
                    "effect": "allow",
                    "action": "read",
                    "resource": "team",
                    "condition": {"user.scopes": {"contains": "rally:participant"}}
                }
            ]
        )
        engine.add_policy(policy)
        
        context = {
            "user": {"scopes": ["rally:participant"]},
            "action": "read",
            "resource": "team"
        }
        
        assert engine.evaluate_permission(context) is True
    
    def test_staff_can_manage_checkpoints(self):
        """Test staff can manage checkpoints"""
        engine = ABACEngine()
        
        # Add staff policy
        policy = Policy(
            name="staff_policy",
            description="Staff permissions",
            rules=[
                {
                    "effect": "allow",
                    "action": "create",
                    "resource": "checkpoint",
                    "condition": {"user.scopes": {"contains": "rally:staff"}}
                },
                {
                    "effect": "allow",
                    "action": "update",
                    "resource": "checkpoint",
                    "condition": {"user.scopes": {"contains": "rally:staff"}}
                }
            ]
        )
        engine.add_policy(policy)
        
        # Test create checkpoint
        context_create = {
            "user": {"scopes": ["rally:staff"]},
            "action": "create",
            "resource": "checkpoint"
        }
        assert engine.evaluate_permission(context_create) is True
        
        # Test update checkpoint
        context_update = {
            "user": {"scopes": ["rally:staff"]},
            "action": "update",
            "resource": "checkpoint"
        }
        assert engine.evaluate_permission(context_update) is True
    
    def test_captain_can_manage_team(self):
        """Test team captain can manage their team"""
        engine = ABACEngine()
        
        # Add captain policy
        policy = Policy(
            name="captain_policy",
            description="Captain permissions",
            rules=[
                {
                    "effect": "allow",
                    "action": "update",
                    "resource": "team",
                    "condition": {
                        "user.scopes": {"contains": "rally:participant"},
                        "user.is_captain": True,
                        "user.team_id": {"equals": "context.team_id"}
                    }
                }
            ]
        )
        engine.add_policy(policy)
        
        context = {
            "user": {
                "scopes": ["rally:participant"],
                "is_captain": True,
                "team_id": 1
            },
            "action": "update",
            "resource": "team",
            "team_id": 1
        }
        
        assert engine.evaluate_permission(context) is True
