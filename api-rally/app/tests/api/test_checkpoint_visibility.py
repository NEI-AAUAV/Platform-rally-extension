
import pytest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from app.main import app
from app.api.deps import get_db, get_current_user_optional, get_current_user
from app.schemas.user import DetailedUser

# Fixtures

@pytest.fixture
def mock_db():
    return Mock()

@pytest.fixture
def client_with_mocked_db(mock_db):
    def override_get_db():
        return mock_db
    
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

@pytest.fixture
def mock_checkpoints():
    return [
        {"id": 1, "name": "CP1", "order": 1, "latitude": 1.0, "longitude": 1.0, "description": "d1", "is_active": True},
        {"id": 2, "name": "CP2", "order": 2, "latitude": 2.0, "longitude": 2.0, "description": "d2", "is_active": True},
        {"id": 3, "name": "CP3", "order": 3, "latitude": 3.0, "longitude": 3.0, "description": "d3", "is_active": True},
    ]

@pytest.fixture
def mock_settings():
    settings = Mock()
    settings.public_access_enabled = True
    settings.show_route_mode = "focused"
    settings.show_checkpoint_map = True
    return settings

# Tests

class TestCheckpointVisibility:
    
    def test_public_access_focused_mode(self, client_with_mocked_db, mock_db, mock_checkpoints, mock_settings):
        """
        Scenario: Public user (no login), mode='focused'.
        Expected: Should see ONLY the first checkpoint (or none? User said 'only the first one').
        Current Bug: Shows all.
        """
        mock_settings.show_route_mode = "focused"
        mock_settings.public_access_enabled = True
        mock_settings.show_checkpoint_map = True
        
        # Mock settings
        with patch("app.crud.crud_rally_settings.rally_settings.get_or_create", return_value=mock_settings):
            # Mock get_all_ordered
            mock_scalars = Mock()
            mock_scalars.all.return_value = mock_checkpoints
            mock_db.scalars.return_value = mock_scalars
            
            # Patch crud.checkpoint.get_all_ordered directly as used in api
            with patch("app.crud.crud_checkpoint.checkpoint.get_all_ordered", return_value=mock_checkpoints):
                
                response = client_with_mocked_db.get("/api/rally/v1/checkpoint/")
                
                assert response.status_code == 200
                data = response.json()
                
                # BUG REPRODUCTION ASSERTION:
                # If the bug exists, this will likely return 3 checkpoints.
                # If fixed, it should return 1.
                print(f"DEBUG: Public Focused Mode returned {len(data)} checkpoints")
                if len(data) == 3:
                     pytest.fail("Public user in 'focused' mode sees ALL checkpoints (Bug Reproduced)")
                
                assert len(data) == 1
                assert data[0]["id"] == 1

    def test_public_access_complete_mode(self, client_with_mocked_db, mock_db, mock_checkpoints, mock_settings):
        """
        Scenario: Public user, mode='complete'.
        Expected: Should see ALL checkpoints.
        """
        mock_settings.show_route_mode = "complete"
        mock_settings.public_access_enabled = True
        
        with patch("app.crud.crud_rally_settings.rally_settings.get_or_create", return_value=mock_settings):
            with patch("app.crud.crud_checkpoint.checkpoint.get_all_ordered", return_value=mock_checkpoints):
                
                response = client_with_mocked_db.get("/api/rally/v1/checkpoint/")
                
                assert response.status_code == 200
                data = response.json()
                assert len(data) == 3

    def test_team_access_focused_mode_zero_progress(self, client_with_mocked_db, mock_db, mock_checkpoints, mock_settings):
        """
        Scenario: Team (no progress), mode='focused'.
        Expected: Should see 1st checkpoint (Completed(0) + Next(1) = 1).
        """
        mock_settings.show_route_mode = "focused"
        
        # Mock authenticated team user
        mock_team_user = DetailedUser(id=1, name="Team User", email="team@test.com", team_id=1, scopes=[], is_active=True, is_superuser=False, disabled=False)
        app.dependency_overrides[get_current_user_optional] = lambda: mock_team_user
        
        mock_team = Mock()
        mock_team.times = [] # No completed checkpoints
        mock_team.name = "Test Team"

        with patch("app.crud.crud_rally_settings.rally_settings.get_or_create", return_value=mock_settings):
            with patch("app.crud.crud_checkpoint.checkpoint.get_all_ordered", return_value=mock_checkpoints):
                with patch("app.crud.crud_team.team.get", return_value=mock_team):
                    
                    response = client_with_mocked_db.get("/api/rally/v1/checkpoint/")
                    
                    assert response.status_code == 200
                    data = response.json()
                    assert len(data) == 1
                    assert data[0]["id"] == 1

    def test_team_access_focused_mode_some_progress(self, client_with_mocked_db, mock_db, mock_checkpoints, mock_settings):
        """
        Scenario: Team (1 completed), mode='focused'.
        Expected: Should see 1st and 2nd checkpoint.
        """
        mock_settings.show_route_mode = "focused"
        
        # Mock authenticated team user
        mock_team_user = DetailedUser(id=1, name="Team User", email="team@test.com", team_id=1, scopes=[], is_active=True, is_superuser=False, disabled=False)
        app.dependency_overrides[get_current_user_optional] = lambda: mock_team_user
        
        mock_team = Mock()
        mock_team.times = [datetime.now()] # 1 completed
        mock_team.name = "Test Team"

        with patch("app.crud.crud_rally_settings.rally_settings.get_or_create", return_value=mock_settings):
            with patch("app.crud.crud_checkpoint.checkpoint.get_all_ordered", return_value=mock_checkpoints):
                with patch("app.crud.crud_team.team.get", return_value=mock_team):
                    
                    response = client_with_mocked_db.get("/api/rally/v1/checkpoint/")
                    
                    assert response.status_code == 200
                    data = response.json()
                    assert len(data) == 2
                    assert data[0]["id"] == 1
                    assert data[1]["id"] == 2

    def test_admin_access_always_all(self, client_with_mocked_db, mock_db, mock_checkpoints, mock_settings):
        """
        Scenario: Admin user.
        Expected: Should see ALL checkpoints regardless of mode.
        """
        mock_settings.show_route_mode = "focused" # Even in focused mode
        
        # Mock authenticated admin user
        mock_admin_user = Mock(spec=DetailedUser)
        mock_admin_user.id = 2
        mock_admin_user.name = "Admin"
        mock_admin_user.team_id = None
        mock_admin_user.scopes = ["admin"]
        mock_admin_user.disabled = False
        app.dependency_overrides[get_current_user_optional] = lambda: mock_admin_user
        
        with patch("app.crud.crud_rally_settings.rally_settings.get_or_create", return_value=mock_settings):
            with patch("app.crud.crud_checkpoint.checkpoint.get_all_ordered", return_value=mock_checkpoints):
                # Should NOT call team.get
                with patch("app.crud.crud_team.team.get") as mock_team_get:
                    
                    response = client_with_mocked_db.get("/api/rally/v1/checkpoint/")
                    
                    assert response.status_code == 200
                    data = response.json()
                    assert len(data) == 3
                    mock_team_get.assert_not_called()
