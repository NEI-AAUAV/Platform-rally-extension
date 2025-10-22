"""
Test suite for Rally API endpoints and business logic
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone
from unittest.mock import patch

from app.main import app
from app.db.base_class import Base
from app.db.session import get_db
from app.models.user import User
from app.models.team import Team
from app.models.rally_settings import RallySettings
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.crud.crud_user import user as crud_user
from app.schemas.user import UserCreate
from app.schemas.team import TeamCreate
from app.schemas.team_members import TeamMemberAdd


# Test database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database for each test"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def test_settings(db_session):
    """Create test rally settings"""
    settings = RallySettings(
        id=1,
        rally_theme="Test Rally",
        max_teams=10,
        max_members_per_team=5,
        rally_start_time=datetime.now(timezone.utc),
        rally_end_time=datetime.now(timezone.utc),
        checkpoint_order_matters=True,
        show_checkpoint_map=True,
        enable_versus=True,
        public_access_enabled=True
    )
    db_session.add(settings)
    db_session.commit()
    db_session.refresh(settings)
    return settings


@pytest.fixture
def test_team(db_session, test_settings):
    """Create a test team"""
    team_data = TeamCreate(name="Test Team", color="#FF0000")
    team = crud_team.create(db_session, obj_in=team_data)
    return team


@pytest.fixture
def test_user(db_session, test_team):
    """Create a test user"""
    user_data = UserCreate(
        name="Test User",
        email="test@example.com",
        team_id=test_team.id,
        is_captain=True
    )
    user = crud_user.create(db_session, obj_in=user_data)
    return user


class TestRallySettings:
    """Test rally settings functionality"""
    
    def test_get_rally_settings_public(self, db_session, test_settings):
        """Test public rally settings endpoint"""
        response = client.get("/api/rally/v1/rally/settings/public")
        assert response.status_code == 200
        data = response.json()
        assert data["rally_theme"] == "Test Rally"
        assert data["max_teams"] == 10
        assert data["public_access_enabled"] is True
    
    def test_rally_settings_not_found(self, db_session):
        """Test rally settings when none exist"""
        response = client.get("/api/rally/v1/rally/settings/public")
        assert response.status_code == 200
        data = response.json()
        # Should return default values
        assert data["rally_theme"] == "Rally Tascas"
        assert data["max_teams"] == 20


class TestTeamMembers:
    """Test team member management"""
    
    def test_add_team_member_success(self, db_session, test_team, test_settings):
        """Test adding a team member successfully"""
        member_data = {
            "name": "New Member",
            "email": "member@example.com",
            "is_captain": False
        }
        
        with patch('app.api.api_v1.team_members.require_team_management_permission'):
            response = client.post(
                f"/api/rally/v1/team/{test_team.id}/members",
                json=member_data
            )
        
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "New Member"
        assert data["is_captain"] is False
    
    def test_add_team_member_team_not_found(self, db_session):
        """Test adding member to non-existent team"""
        member_data = {
            "name": "New Member",
            "email": "member@example.com",
            "is_captain": False
        }
        
        with patch('app.api.api_v1.team_members.require_team_management_permission'):
            response = client.post(
                "/api/rally/v1/team/999/members",
                json=member_data
            )
        
        assert response.status_code == 404
        assert "Team not found" in response.json()["detail"]
    
    def test_add_team_member_limit_exceeded(self, db_session, test_team, test_settings):
        """Test adding member when team limit is exceeded"""
        # Add members up to the limit
        for i in range(test_settings.max_members_per_team):
            member_data = {
                "name": f"Member {i}",
                "email": f"member{i}@example.com",
                "is_captain": False
            }
            with patch('app.api.api_v1.team_members.require_team_management_permission'):
                client.post(f"/api/rally/v1/team/{test_team.id}/members", json=member_data)
        
        # Try to add one more member
        member_data = {
            "name": "Extra Member",
            "email": "extra@example.com",
            "is_captain": False
        }
        
        with patch('app.api.api_v1.team_members.require_team_management_permission'):
            response = client.post(
                f"/api/rally/v1/team/{test_team.id}/members",
                json=member_data
            )
        
        assert response.status_code == 400
        assert "Team member limit reached" in response.json()["detail"]
    
    def test_add_captain_when_team_has_captain(self, db_session, test_team, test_user):
        """Test adding captain when team already has one"""
        member_data = {
            "name": "New Captain",
            "email": "captain@example.com",
            "is_captain": True
        }
        
        with patch('app.api.api_v1.team_members.require_team_management_permission'):
            response = client.post(
                f"/api/rally/v1/team/{test_team.id}/members",
                json=member_data
            )
        
        assert response.status_code == 400
        assert "Team already has a captain" in response.json()["detail"]
    
    def test_remove_team_member_success(self, db_session, test_team, test_user):
        """Test removing a team member successfully"""
        with patch('app.api.api_v1.team_members.require_team_management_permission'):
            response = client.delete(
                f"/api/rally/v1/team/{test_team.id}/members/{test_user.id}"
            )
        
        assert response.status_code == 200
        assert "Member removed from team successfully" in response.json()["message"]
    
    def test_get_team_members(self, db_session, test_team, test_user):
        """Test getting team members"""
        with patch('app.api.api_v1.team_members.require_team_management_permission'):
            response = client.get(f"/api/rally/v1/team/{test_team.id}/members")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test User"
        assert data[0]["is_captain"] is True


class TestTeamCRUD:
    """Test team CRUD operations"""
    
    def test_add_checkpoint_timing_validation(self, db_session, test_team, test_settings):
        """Test checkpoint timing validation"""
        # Set rally to start in the future
        future_time = datetime.now(timezone.utc).replace(hour=23, minute=59)
        test_settings.rally_start_time = future_time
        db_session.commit()
        
        checkpoint_data = {
            "question_score": 10,
            "time_score": 5,
            "pukes": 0,
            "skips": 0
        }
        
        with patch('app.api.api_v1.teams.require_team_management_permission'):
            response = client.post(
                f"/api/rally/v1/team/{test_team.id}/checkpoint/1",
                json=checkpoint_data
            )
        
        assert response.status_code == 400
        assert "Rally has not started yet" in response.json()["detail"]
    
    def test_add_checkpoint_order_validation(self, db_session, test_team, test_settings):
        """Test checkpoint order validation when order matters"""
        checkpoint_data = {
            "question_score": 10,
            "time_score": 5,
            "pukes": 0,
            "skips": 0
        }
        
        with patch('app.api.api_v1.teams.require_team_management_permission'):
            # Try to add checkpoint 2 without adding checkpoint 1 first
            response = client.post(
                f"/api/rally/v1/team/{test_team.id}/checkpoint/2",
                json=checkpoint_data
            )
        
        assert response.status_code == 400
        assert "Checkpoint not in order" in response.json()["detail"]
    
    def test_add_checkpoint_success(self, db_session, test_team, test_settings):
        """Test successful checkpoint addition"""
        checkpoint_data = {
            "question_score": 10,
            "time_score": 5,
            "pukes": 0,
            "skips": 0
        }
        
        with patch('app.api.api_v1.teams.require_team_management_permission'):
            response = client.post(
                f"/api/rally/v1/team/{test_team.id}/checkpoint/1",
                json=checkpoint_data
            )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["times"]) == 1
        assert data["question_scores"][0] == 10


class TestRallyDuration:
    """Test rally duration calculations"""
    
    def test_rally_status_not_started(self, db_session, test_settings):
        """Test rally status when not started"""
        from app.utils.rally_duration import RallyDuration
        
        # Set rally to start in the future
        future_time = datetime.now(timezone.utc).replace(hour=23, minute=59)
        test_settings.rally_start_time = future_time
        db_session.commit()
        
        duration = RallyDuration(db_session)
        status = duration.get_rally_status()
        
        assert status["status"] == "not_started"
        assert "starts_at" in status
    
    def test_rally_status_ended(self, db_session, test_settings):
        """Test rally status when ended"""
        from app.utils.rally_duration import RallyDuration
        
        # Set rally to end in the past
        past_time = datetime.now(timezone.utc).replace(hour=0, minute=0)
        test_settings.rally_end_time = past_time
        db_session.commit()
        
        duration = RallyDuration(db_session)
        status = duration.get_rally_status()
        
        assert status["status"] == "ended"
        assert "ended_at" in status
    
    def test_rally_status_active(self, db_session, test_settings):
        """Test rally status when active"""
        from app.utils.rally_duration import RallyDuration
        
        # Set rally to be active now
        now = datetime.now(timezone.utc)
        test_settings.rally_start_time = now.replace(hour=0, minute=0)
        test_settings.rally_end_time = now.replace(hour=23, minute=59)
        db_session.commit()
        
        duration = RallyDuration(db_session)
        status = duration.get_rally_status()
        
        assert status["status"] == "active"
        assert "time_remaining" in status


class TestTimezoneHandling:
    """Test timezone handling in API"""
    
    def test_datetime_utc_storage(self, db_session):
        """Test that datetimes are stored in UTC"""
        now_utc = datetime.now(timezone.utc)
        settings = RallySettings(
            id=1,
            rally_start_time=now_utc,
            rally_end_time=now_utc
        )
        db_session.add(settings)
        db_session.commit()
        db_session.refresh(settings)
        
        # Verify timezone info is preserved
        assert settings.rally_start_time.tzinfo is not None
        assert settings.rally_start_time.tzinfo.utcoffset(None).total_seconds() == 0
    
    def test_datetime_comparison_utc(self, db_session, test_settings):
        """Test datetime comparison uses UTC"""
        from app.crud.crud_team import CRUDTeam
        
        crud = CRUDTeam(Team)
        
        # Create a team and try to add checkpoint
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        team = crud.create(db_session, obj_in=team_data)
        
        checkpoint_data = {
            "question_score": 10,
            "time_score": 5,
            "pukes": 0,
            "skips": 0
        }
        
        # This should work if timing validation uses UTC correctly
        result = crud.add_checkpoint(
            db_session,
            id=team.id,
            checkpoint_id=1,
            obj_in=checkpoint_data
        )
        
        assert result is not None
        assert len(result.times) == 1
