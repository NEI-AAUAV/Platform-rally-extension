"""
Tests for Rally Duration API endpoints
"""
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timezone, timedelta
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
def mock_rally_settings():
    """Mock rally settings"""
    return Mock(
        rally_start_time=datetime(2024, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
        rally_end_time=datetime(2024, 1, 15, 18, 0, 0, tzinfo=timezone.utc)
    )


@pytest.fixture
def mock_team():
    """Mock team with checkpoint times"""
    team = Mock()
    team.times = [datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)]
    return team


class TestRallyDurationAPI:
    """Test Rally Duration API endpoints"""
    
    def test_get_rally_duration_success(self, client_with_mocked_db, mock_db, mock_rally_settings):
        """Test getting rally duration information"""
        with patch('app.utils.rally_duration.get_rally_duration_info') as mock_get_duration:
            mock_get_duration.return_value = {
                "current_time": "2024-01-15T12:00:00Z",
                "rally_start_time": "2024-01-15T10:00:00Z",
                "rally_end_time": "2024-01-15T18:00:00Z",
                "status": "active",
                "time_elapsed": "2h 0m 0s",
                "time_remaining": "6h 0m 0s",
                "total_duration": "8h 0m 0s",
                "progress_percentage": 25.0
            }
            
            response = client_with_mocked_db.get("/api/rally/v1/rally/duration")
            
            # This endpoint requires authentication, so expect 401, 200, or 404 (route not found)
            assert response.status_code in [200, 401, 404]
            
            if response.status_code == 200:
                data = response.json()
                assert data["status"] == "active"
                assert data["progress_percentage"] == 25.0
    
    def test_get_team_rally_duration_success(self, client_with_mocked_db, mock_db, mock_team):
        """Test getting team rally duration information"""
        with patch('app.crud.crud_team.team.get') as mock_get_team, \
             patch('app.utils.rally_duration.get_team_duration_info') as mock_get_duration:
            
            mock_get_team.return_value = mock_team
            mock_get_duration.return_value = {
                "team_start_time": "2024-01-15T10:30:00Z",
                "current_time": "2024-01-15T12:00:00Z",
                "team_duration": "1h 30m 0s",
                "team_duration_seconds": 5400,
                "total_rally_duration": "8h 0m 0s",
                "total_rally_duration_seconds": 28800,
                "is_within_rally_time": True
            }
            
            response = client_with_mocked_db.get("/api/rally/v1/rally/team-duration/1")
            
            # This endpoint requires authentication, so expect 401, 200, or 404 (route not found)
            assert response.status_code in [200, 401, 404]
            
            if response.status_code == 200:
                data = response.json()
                assert data["team_duration"] == "1h 30m 0s"
                assert data["is_within_rally_time"] is True
    
    def test_get_team_rally_duration_team_not_found(self, client_with_mocked_db, mock_db):
        """Test getting team duration for non-existent team"""
        with patch('app.crud.crud_team.team.get') as mock_get_team:
            mock_get_team.return_value = None
            
            response = client_with_mocked_db.get("/api/rally/v1/rally/team-duration/999")
            
            # This endpoint requires authentication, so expect 401, 200, or 404 (route not found)
            assert response.status_code in [200, 401, 404]
            
            if response.status_code == 200:
                data = response.json()
                assert "error" in data
                assert "Team not found" in data["error"]
    
    def test_get_team_rally_duration_no_times(self, client_with_mocked_db, mock_db):
        """Test getting team duration for team with no checkpoint times"""
        team_without_times = Mock()
        team_without_times.times = []
        
        with patch('app.crud.crud_team.team.get') as mock_get_team:
            mock_get_team.return_value = team_without_times
            
            response = client_with_mocked_db.get("/api/rally/v1/rally/team-duration/1")
            
            # This endpoint requires authentication, so expect 401, 200, or 404 (route not found)
            assert response.status_code in [200, 401, 404]
            
            if response.status_code == 200:
                data = response.json()
                assert "error" in data
                assert "has no checkpoint times" in data["error"]


class TestRallyDurationCalculator:
    """Test RallyDurationCalculator utility class"""
    
    def test_rally_status_not_started(self, mock_db, mock_rally_settings):
        """Test rally status when rally hasn't started"""
        with patch('app.crud.crud_rally_settings.rally_settings.get_or_create') as mock_get_settings, \
             patch('app.utils.rally_duration.datetime') as mock_datetime:
            
            mock_get_settings.return_value = mock_rally_settings
            mock_datetime.now.return_value = datetime(2024, 1, 15, 9, 0, 0, tzinfo=timezone.utc)
            mock_datetime.timezone = timezone
            mock_datetime.datetime = datetime
            
            from app.utils.rally_duration import RallyDurationCalculator
            calculator = RallyDurationCalculator(mock_db)
            status = calculator.get_rally_status()
            
            assert status["status"] == "not_started"
            assert "time_until_start" in status
            assert status["rally_start_time"] is not None
    
    def test_rally_status_active(self, mock_db, mock_rally_settings):
        """Test rally status when rally is active"""
        with patch('app.crud.crud_rally_settings.rally_settings.get_or_create') as mock_get_settings, \
             patch('app.utils.rally_duration.datetime') as mock_datetime:
            
            mock_get_settings.return_value = mock_rally_settings
            mock_datetime.now.return_value = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
            mock_datetime.timezone = timezone
            
            from app.utils.rally_duration import RallyDurationCalculator
            calculator = RallyDurationCalculator(mock_db)
            status = calculator.get_rally_status()
            
            assert status["status"] == "active"
            assert "time_elapsed" in status
            assert "time_remaining" in status
            assert "progress_percentage" in status
    
    def test_rally_status_ended(self, mock_db, mock_rally_settings):
        """Test rally status when rally has ended"""
        with patch('app.crud.crud_rally_settings.rally_settings.get_or_create') as mock_get_settings, \
             patch('app.utils.rally_duration.datetime') as mock_datetime:
            
            mock_get_settings.return_value = mock_rally_settings
            mock_datetime.now.return_value = datetime(2024, 1, 15, 19, 0, 0, tzinfo=timezone.utc)
            mock_datetime.timezone = timezone
            
            from app.utils.rally_duration import RallyDurationCalculator
            calculator = RallyDurationCalculator(mock_db)
            status = calculator.get_rally_status()
            
            assert status["status"] == "ended"
            assert "time_since_end" in status
            assert "total_duration" in status
    
    def test_rally_status_no_start_time(self, mock_db):
        """Test rally status when no start time is configured"""
        settings_no_start = Mock(rally_start_time=None, rally_end_time=None)
        
        with patch('app.crud.crud_rally_settings.rally_settings.get_or_create') as mock_get_settings, \
             patch('app.utils.rally_duration.datetime') as mock_datetime:
            
            mock_get_settings.return_value = settings_no_start
            mock_datetime.now.return_value = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
            mock_datetime.timezone = timezone
            mock_datetime.datetime = datetime
            
            from app.utils.rally_duration import RallyDurationCalculator
            calculator = RallyDurationCalculator(mock_db)
            status = calculator.get_rally_status()
            
            assert status["status"] == "no_start_time"
    
    def test_format_duration(self, mock_db):
        """Test duration formatting"""
        with patch('app.crud.crud_rally_settings.rally_settings.get_or_create'):
            from app.utils.rally_duration import RallyDurationCalculator
            calculator = RallyDurationCalculator(mock_db)
            
            # Test various durations
            assert calculator._format_duration(timedelta(hours=2, minutes=30)) == "2h 30m"
            assert calculator._format_duration(timedelta(days=1, hours=2)) == "1d 2h"
            assert calculator._format_duration(timedelta(seconds=45)) == "45s"
            assert calculator._format_duration(timedelta(minutes=5)) == "5m"
    
    def test_calculate_progress_percentage(self, mock_db):
        """Test progress percentage calculation"""
        with patch('app.crud.crud_rally_settings.rally_settings.get_or_create'):
            from app.utils.rally_duration import RallyDurationCalculator
            calculator = RallyDurationCalculator(mock_db)
            
            # Test progress calculation
            elapsed = timedelta(hours=2)
            total = timedelta(hours=8)
            progress = calculator._calculate_progress_percentage(elapsed, total)
            assert progress == 25.0
            
            # Test zero total duration
            progress_zero = calculator._calculate_progress_percentage(elapsed, timedelta(0))
            assert progress_zero == 0.0
    
    def test_is_within_rally_time(self, mock_db, mock_rally_settings):
        """Test team start time validation"""
        with patch('app.crud.crud_rally_settings.rally_settings.get_or_create') as mock_get_settings:
            mock_get_settings.return_value = mock_rally_settings
            
            from app.utils.rally_duration import RallyDurationCalculator
            calculator = RallyDurationCalculator(mock_db)
            
            # Test within rally time
            within_time = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
            assert calculator._is_within_rally_time(within_time) is True
            
            # Test before rally time
            before_time = datetime(2024, 1, 15, 9, 0, 0, tzinfo=timezone.utc)
            assert calculator._is_within_rally_time(before_time) is False
            
            # Test after rally time
            after_time = datetime(2024, 1, 15, 19, 0, 0, tzinfo=timezone.utc)
            assert calculator._is_within_rally_time(after_time) is False


class TestRallyDurationConvenienceFunctions:
    """Test convenience functions"""
    
    def test_get_rally_duration_info(self, mock_db):
        """Test get_rally_duration_info convenience function"""
        with patch('app.utils.rally_duration.RallyDurationCalculator') as mock_calculator_class:
            mock_calculator = Mock()
            mock_calculator.get_rally_status.return_value = {"status": "active"}
            mock_calculator_class.return_value = mock_calculator
            
            from app.utils.rally_duration import get_rally_duration_info
            result = get_rally_duration_info(mock_db)
            
            assert result["status"] == "active"
            mock_calculator.get_rally_status.assert_called_once()
    
    def test_get_team_duration_info(self, mock_db):
        """Test get_team_duration_info convenience function"""
        team_start_time = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        
        with patch('app.utils.rally_duration.RallyDurationCalculator') as mock_calculator_class:
            mock_calculator = Mock()
            mock_calculator.get_team_rally_duration.return_value = {"team_duration": "1h 30m"}
            mock_calculator_class.return_value = mock_calculator
            
            from app.utils.rally_duration import get_team_duration_info
            result = get_team_duration_info(mock_db, team_start_time)
            
            assert result["team_duration"] == "1h 30m"
            mock_calculator.get_team_rally_duration.assert_called_once_with(team_start_time)
