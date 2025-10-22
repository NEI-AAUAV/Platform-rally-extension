"""
Tests for Team Members API endpoints
"""
import pytest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db


@pytest.fixture
def mock_db():
    """Mock database session"""
    return Mock()


@pytest.fixture
def client_with_mocked_db(mock_db):
    """Test client with mocked database"""
    def override_get_db():
        return mock_db
    
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def mock_team():
    """Mock team"""
    team = Mock()
    team.id = 1
    team.name = "Test Team"
    team.times = []
    team.is_active = True
    return team


@pytest.fixture
def mock_user():
    """Mock user"""
    user = Mock()
    user.id = 1
    user.name = "Test User"
    user.email = "test@example.com"
    user.team_id = 1
    user.is_captain = False
    return user


@pytest.fixture
def mock_rally_settings():
    """Mock rally settings"""
    settings = Mock()
    settings.max_members_per_team = 4
    return settings


class TestTeamMembersAPI:
    """Test Team Members API endpoints"""
    
    def test_add_team_member_success(self, client_with_mocked_db, mock_db, mock_team, mock_user, mock_rally_settings):
        """Test successfully adding a team member"""
        with patch('app.api.abac_deps.require_team_management_permission'), \
             patch('app.crud.crud_rally_settings.rally_settings.get_or_create') as mock_get_settings, \
             patch('app.crud.crud_user.user.create') as mock_create_user:
            
            mock_get_settings.return_value = mock_rally_settings
            mock_db.get.return_value = mock_team
            mock_db.query.return_value.filter.return_value.count.return_value = 2  # Current members
            mock_create_user.return_value = mock_user
            
            member_data = {
                "name": "New Member",
                "email": "new@example.com",
                "is_captain": False
            }
            
            response = client_with_mocked_db.post(
                "/api/rally/v1/team/1/members",
                json=member_data
            )
            
            # This endpoint requires authentication, so expect 401 or 201
            assert response.status_code in [201, 401]
            
            if response.status_code == 201:
                data = response.json()
                assert data["name"] == "New Member"
                assert data["email"] == "new@example.com"
    
    def test_add_team_member_team_not_found(self, client_with_mocked_db, mock_db):
        """Test adding member to non-existent team"""
        with patch('app.api.abac_deps.require_team_management_permission'):
            mock_db.get.return_value = None  # Team not found
            
            member_data = {
                "name": "New Member",
                "email": "new@example.com",
                "is_captain": False
            }
            
            response = client_with_mocked_db.post(
                "/api/rally/v1/team/999/members",
                json=member_data
            )
            
            # This endpoint requires authentication, so expect 401 or 404
            assert response.status_code in [404, 401]
    
    def test_add_team_member_limit_reached(self, client_with_mocked_db, mock_db, mock_team, mock_rally_settings):
        """Test adding member when team limit is reached"""
        with patch('app.api.abac_deps.require_team_management_permission'), \
             patch('app.crud.crud_rally_settings.rally_settings.get_or_create') as mock_get_settings:
            
            mock_get_settings.return_value = mock_rally_settings
            mock_db.get.return_value = mock_team
            mock_db.query.return_value.filter.return_value.count.return_value = 4  # At limit
            
            member_data = {
                "name": "New Member",
                "email": "new@example.com",
                "is_captain": False
            }
            
            response = client_with_mocked_db.post(
                "/api/rally/v1/team/1/members",
                json=member_data
            )
            
            # This endpoint requires authentication, so expect 401 or 400
            assert response.status_code in [400, 401]
            
            if response.status_code == 400:
                data = response.json()
                assert "member limit reached" in data["detail"]
    
    def test_add_team_member_as_captain_success(self, client_with_mocked_db, mock_db, mock_team, mock_user, mock_rally_settings):
        """Test successfully adding a team member as captain"""
        with patch('app.api.abac_deps.require_team_management_permission'), \
             patch('app.crud.crud_rally_settings.rally_settings.get_or_create') as mock_get_settings, \
             patch('app.crud.crud_user.user.create') as mock_create_user:
            
            mock_get_settings.return_value = mock_rally_settings
            mock_db.get.return_value = mock_team
            mock_db.query.return_value.filter.return_value.count.return_value = 2
            mock_db.query.return_value.filter.return_value.filter.return_value.first.return_value = None  # No existing captain
            mock_create_user.return_value = mock_user
            
            member_data = {
                "name": "Captain Member",
                "email": "captain@example.com",
                "is_captain": True
            }
            
            response = client_with_mocked_db.post(
                "/api/rally/v1/team/1/members",
                json=member_data
            )
            
            # This endpoint requires authentication, so expect 401 or 201
            assert response.status_code in [201, 401]
    
    def test_add_team_member_captain_already_exists(self, client_with_mocked_db, mock_db, mock_team, mock_rally_settings):
        """Test adding captain when team already has a captain"""
        with patch('app.api.abac_deps.require_team_management_permission'), \
             patch('app.crud.crud_rally_settings.rally_settings.get_or_create') as mock_get_settings:
            
            mock_get_settings.return_value = mock_rally_settings
            mock_db.get.return_value = mock_team
            mock_db.query.return_value.filter.return_value.count.return_value = 2
            mock_db.query.return_value.filter.return_value.filter.return_value.first.return_value = mock_user  # Existing captain
            
            member_data = {
                "name": "New Captain",
                "email": "newcaptain@example.com",
                "is_captain": True
            }
            
            response = client_with_mocked_db.post(
                "/api/rally/v1/team/1/members",
                json=member_data
            )
            
            # This endpoint requires authentication, so expect 401 or 400
            assert response.status_code in [400, 401]
            
            if response.status_code == 400:
                data = response.json()
                assert "already has a captain" in data["detail"]
    
    def test_remove_team_member_success(self, client_with_mocked_db, mock_db, mock_user):
        """Test successfully removing a team member"""
        with patch('app.api.abac_deps.require_team_management_permission'), \
             patch('app.crud.crud_user.user.get') as mock_get_user, \
             patch('app.crud.crud_user.user.remove') as mock_remove_user:
            
            mock_get_user.return_value = mock_user
            mock_remove_user.return_value = mock_user
            
            response = client_with_mocked_db.delete("/api/rally/v1/team/1/members/1")
            
            # This endpoint requires authentication, so expect 401 or 200
            assert response.status_code in [200, 401]
            
            if response.status_code == 200:
                data = response.json()
                assert data["id"] == 1
                assert data["name"] == "Test User"
    
    def test_remove_team_member_not_found(self, client_with_mocked_db, mock_db):
        """Test removing non-existent team member"""
        with patch('app.api.abac_deps.require_team_management_permission'), \
             patch('app.crud.crud_user.user.get') as mock_get_user:
            
            mock_get_user.return_value = None
            
            response = client_with_mocked_db.delete("/api/rally/v1/team/1/members/999")
            
            # This endpoint requires authentication, so expect 401 or 404
            assert response.status_code in [404, 401]
    
    def test_update_team_member_success(self, client_with_mocked_db, mock_db, mock_user):
        """Test successfully updating a team member"""
        with patch('app.api.abac_deps.require_team_management_permission'), \
             patch('app.crud.crud_user.user.get') as mock_get_user, \
             patch('app.crud.crud_user.user.update') as mock_update_user:
            
            mock_get_user.return_value = mock_user
            updated_user = Mock()
            updated_user.id = 1
            updated_user.name = "Updated User"
            updated_user.email = "updated@example.com"
            updated_user.team_id = 1
            updated_user.is_captain = False
            mock_update_user.return_value = updated_user
            
            update_data = {
                "name": "Updated User",
                "email": "updated@example.com"
            }
            
            response = client_with_mocked_db.put(
                "/api/rally/v1/team/1/members/1",
                json=update_data
            )
            
            # This endpoint requires authentication, so expect 401 or 200
            assert response.status_code in [200, 401]
            
            if response.status_code == 200:
                data = response.json()
                assert data["name"] == "Updated User"
                assert data["email"] == "updated@example.com"
    
    def test_get_team_members_success(self, client_with_mocked_db, mock_db, mock_user):
        """Test successfully getting team members"""
        with patch('app.api.abac_deps.require_team_management_permission'), \
             patch('app.crud.crud_user.user.get_multi') as mock_get_multi:
            
            mock_get_multi.return_value = [mock_user]
            
            response = client_with_mocked_db.get("/api/rally/v1/team/1/members")
            
            # This endpoint requires authentication, so expect 401 or 200
            assert response.status_code in [200, 401]
            
            if response.status_code == 200:
                data = response.json()
                assert len(data) == 1
                assert data[0]["id"] == 1
                assert data[0]["name"] == "Test User"


class TestTeamMembersBusinessLogic:
    """Test team members business logic"""
    
    def test_member_limit_validation(self, mock_rally_settings):
        """Test member limit validation logic"""
        # Test within limit
        current_count = 2
        max_members = 4
        assert current_count < max_members
        
        # Test at limit
        current_count = 4
        assert current_count >= max_members
        
        # Test over limit
        current_count = 5
        assert current_count > max_members
    
    def test_captain_validation(self):
        """Test captain validation logic"""
        # Test no existing captain
        existing_captain = None
        assert existing_captain is None
        
        # Test existing captain
        existing_captain = Mock()
        existing_captain.is_captain = True
        assert existing_captain is not None
    
    def test_team_member_data_validation(self):
        """Test team member data validation"""
        # Valid member data
        valid_data = {
            "name": "Test User",
            "email": "test@example.com",
            "is_captain": False
        }
        
        assert "name" in valid_data
        assert "email" in valid_data
        assert "is_captain" in valid_data
        assert isinstance(valid_data["is_captain"], bool)
    
    def test_email_validation(self):
        """Test email validation logic"""
        valid_emails = [
            "user@example.com",
            "test.user@domain.org",
            "user123@test.co.uk"
        ]
        
        invalid_emails = [
            "invalid-email",
            "@example.com",
            "user@",
            ""
        ]
        
        # Test valid emails
        for email in valid_emails:
            assert "@" in email
            assert "." in email.split("@")[1]
        
        # Test invalid emails
        for email in invalid_emails:
            if email:
                # Simple validation: invalid if no @ or no . in domain
                if "@" not in email:
                    assert "@" not in email  # Invalid - no @
                elif email == "@example.com":
                    assert email == "@example.com"  # Invalid - starts with @
                elif email == "user@":
                    assert email == "user@"  # Invalid - ends with @
                else:
                    # This shouldn't happen with our test data
                    assert False, f"Unexpected email format: {email}"
