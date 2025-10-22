"""
Test suite for Rally CRUD operations and business logic
"""
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base_class import Base
from app.models.user import User
from app.models.team import Team
from app.models.rally_settings import RallySettings
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.crud.crud_user import user as crud_user
from app.schemas.user import UserCreate
from app.schemas.team import TeamCreate
from app.schemas.team_scores import TeamScoresUpdate


# Test database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_crud.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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


class TestRallySettingsCRUD:
    """Test rally settings CRUD operations"""
    
    def test_get_or_create_settings_new(self, db_session):
        """Test creating new settings when none exist"""
        settings = rally_settings.get_or_create(db_session)
        
        assert settings is not None
        assert settings.rally_theme == "Rally Tascas"
        assert settings.max_teams == 20
        assert settings.max_members_per_team == 10
        assert settings.public_access_enabled is False
    
    def test_get_or_create_settings_existing(self, db_session, test_settings):
        """Test getting existing settings"""
        settings = rally_settings.get_or_create(db_session)
        
        assert settings.id == test_settings.id
        assert settings.rally_theme == "Test Rally"
    
    def test_update_settings(self, db_session, test_settings):
        """Test updating rally settings"""
        update_data = {
            "rally_theme": "Updated Rally",
            "max_teams": 15,
            "public_access_enabled": True
        }
        
        updated_settings = rally_settings.update(db_session, db_obj=test_settings, obj_in=update_data)
        
        assert updated_settings.rally_theme == "Updated Rally"
        assert updated_settings.max_teams == 15
        assert updated_settings.public_access_enabled is True


class TestTeamCRUD:
    """Test team CRUD operations"""
    
    def test_create_team(self, db_session):
        """Test creating a new team"""
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        team = crud_team.create(db_session, obj_in=team_data)
        
        assert team.id is not None
        assert team.name == "Test Team"
        assert team.color == "#FF0000"
        assert team.total == 0
    
    def test_get_team(self, db_session):
        """Test getting a team by ID"""
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        created_team = crud_team.create(db_session, obj_in=team_data)
        
        retrieved_team = crud_team.get(db_session, id=created_team.id)
        
        assert retrieved_team is not None
        assert retrieved_team.name == "Test Team"
    
    def test_get_team_not_found(self, db_session):
        """Test getting non-existent team"""
        team = crud_team.get(db_session, id=999)
        assert team is None
    
    def test_get_teams(self, db_session):
        """Test getting all teams"""
        # Create multiple teams
        for i in range(3):
            team_data = TeamCreate(name=f"Team {i}", color="#FF0000")
            crud_team.create(db_session, obj_in=team_data)
        
        teams = crud_team.get_multi(db_session)
        
        assert len(teams) == 3
        assert all(team.name.startswith("Team") for team in teams)
    
    def test_update_team(self, db_session):
        """Test updating a team"""
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        team = crud_team.create(db_session, obj_in=team_data)
        
        update_data = {"name": "Updated Team", "color": "#00FF00"}
        updated_team = crud_team.update(db_session, db_obj=team, obj_in=update_data)
        
        assert updated_team.name == "Updated Team"
        assert updated_team.color == "#00FF00"
    
    def test_delete_team(self, db_session):
        """Test deleting a team"""
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        team = crud_team.create(db_session, obj_in=team_data)
        
        deleted_team = crud_team.remove(db_session, id=team.id)
        
        assert deleted_team is not None
        assert deleted_team.name == "Test Team"
        
        # Verify team is deleted
        retrieved_team = crud_team.get(db_session, id=team.id)
        assert retrieved_team is None


class TestTeamCheckpointLogic:
    """Test team checkpoint addition logic"""
    
    def test_add_checkpoint_timing_validation(self, db_session, test_settings):
        """Test checkpoint timing validation"""
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        team = crud_team.create(db_session, obj_in=team_data)
        
        # Set rally to start in the future
        future_time = datetime.now(timezone.utc).replace(hour=23, minute=59)
        test_settings.rally_start_time = future_time
        db_session.commit()
        
        checkpoint_data = TeamScoresUpdate(
            question_score=10,
            time_score=5,
            pukes=0,
            skips=0
        )
        
        with pytest.raises(Exception) as exc_info:
            crud_team.add_checkpoint(
                db_session,
                id=team.id,
                checkpoint_id=1,
                obj_in=checkpoint_data
            )
        
        assert "Rally has not started yet" in str(exc_info.value)
    
    def test_add_checkpoint_order_validation(self, db_session, test_settings):
        """Test checkpoint order validation when order matters"""
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        team = crud_team.create(db_session, obj_in=team_data)
        
        checkpoint_data = TeamScoresUpdate(
            question_score=10,
            time_score=5,
            pukes=0,
            skips=0
        )
        
        with pytest.raises(Exception) as exc_info:
            crud_team.add_checkpoint(
                db_session,
                id=team.id,
                checkpoint_id=2,  # Skip checkpoint 1
                obj_in=checkpoint_data
            )
        
        assert "Checkpoint not in order" in str(exc_info.value)
    
    def test_add_checkpoint_success(self, db_session, test_settings):
        """Test successful checkpoint addition"""
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        team = crud_team.create(db_session, obj_in=team_data)
        
        checkpoint_data = TeamScoresUpdate(
            question_score=10,
            time_score=5,
            pukes=0,
            skips=0
        )
        
        updated_team = crud_team.add_checkpoint(
            db_session,
            id=team.id,
            checkpoint_id=1,
            obj_in=checkpoint_data
        )
        
        assert len(updated_team.times) == 1
        assert updated_team.question_scores[0] == 10
        assert updated_team.time_scores[0] == 5
        assert updated_team.total == 15  # 10 + 5
    
    def test_add_checkpoint_random_cards(self, db_session, test_settings):
        """Test random card assignment logic"""
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        team = crud_team.create(db_session, obj_in=team_data)
        
        checkpoint_data = TeamScoresUpdate(
            question_score=10,
            time_score=5,
            pukes=0,
            skips=0
        )
        
        # Add 7 checkpoints to trigger pity mechanic
        for i in range(7):
            crud_team.add_checkpoint(
                db_session,
                id=team.id,
                checkpoint_id=i + 1,
                obj_in=checkpoint_data
            )
        
        db_session.refresh(team)
        
        # At least one card should be assigned due to pity mechanic
        cards_assigned = sum(1 for card in [team.card1, team.card2, team.card3] if card == 0)
        assert cards_assigned >= 1


class TestUserCRUD:
    """Test user CRUD operations"""
    
    def test_create_user(self, db_session):
        """Test creating a new user"""
        user_data = UserCreate(
            name="Test User",
            email="test@example.com",
            team_id=1,
            is_captain=True
        )
        user = crud_user.create(db_session, obj_in=user_data)
        
        assert user.id is not None
        assert user.name == "Test User"
        assert user.email == "test@example.com"
        assert user.team_id == 1
        assert user.is_captain is True
    
    def test_get_user(self, db_session):
        """Test getting a user by ID"""
        user_data = UserCreate(
            name="Test User",
            email="test@example.com",
            team_id=1,
            is_captain=True
        )
        created_user = crud_user.create(db_session, obj_in=user_data)
        
        retrieved_user = crud_user.get(db_session, id=created_user.id)
        
        assert retrieved_user is not None
        assert retrieved_user.name == "Test User"
    
    def test_get_users_by_team(self, db_session):
        """Test getting users by team ID"""
        # Create users for different teams
        for team_id in [1, 1, 2]:
            user_data = UserCreate(
                name=f"User {team_id}",
                email=f"user{team_id}@example.com",
                team_id=team_id,
                is_captain=False
            )
            crud_user.create(db_session, obj_in=user_data)
        
        team1_users = crud_user.get_by_team(db_session, team_id=1)
        team2_users = crud_user.get_by_team(db_session, team_id=2)
        
        assert len(team1_users) == 2
        assert len(team2_users) == 1
        assert all(user.team_id == 1 for user in team1_users)
        assert all(user.team_id == 2 for user in team2_users)


class TestRallyDurationLogic:
    """Test rally duration calculation logic"""
    
    def test_rally_status_calculations(self, db_session):
        """Test rally status calculations"""
        from app.utils.rally_duration import RallyDuration
        
        # Test not started
        future_time = datetime.now(timezone.utc).replace(hour=23, minute=59)
        settings = RallySettings(
            id=1,
            rally_start_time=future_time,
            rally_end_time=future_time.replace(hour=23, minute=59)
        )
        db_session.add(settings)
        db_session.commit()
        
        duration = RallyDuration(db_session)
        status = duration.get_rally_status()
        
        assert status["status"] == "not_started"
        assert "starts_at" in status
        
        # Test ended
        past_time = datetime.now(timezone.utc).replace(hour=0, minute=0)
        settings.rally_start_time = past_time
        settings.rally_end_time = past_time
        db_session.commit()
        
        status = duration.get_rally_status()
        assert status["status"] == "ended"
        assert "ended_at" in status
    
    def test_team_duration_calculation(self, db_session):
        """Test team duration calculation"""
        from app.utils.rally_duration import RallyDuration
        
        # Create team with checkpoint times
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        team = crud_team.create(db_session, obj_in=team_data)
        
        # Add some checkpoint times
        now = datetime.now(timezone.utc)
        team.times = [now, now.replace(minute=5), now.replace(minute=10)]
        db_session.commit()
        
        duration = RallyDuration(db_session)
        team_duration = duration.get_team_rally_duration(team.id)
        
        assert team_duration is not None
        assert "total_time" in team_duration
        assert "checkpoint_times" in team_duration
        assert len(team_duration["checkpoint_times"]) == 3


class TestTimezoneHandling:
    """Test timezone handling in CRUD operations"""
    
    def test_datetime_utc_handling(self, db_session):
        """Test that all datetime operations use UTC"""
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
    
    def test_checkpoint_time_utc(self, db_session, test_settings):
        """Test that checkpoint times are stored in UTC"""
        team_data = TeamCreate(name="Test Team", color="#FF0000")
        team = crud_team.create(db_session, obj_in=team_data)
        
        checkpoint_data = TeamScoresUpdate(
            question_score=10,
            time_score=5,
            pukes=0,
            skips=0
        )
        
        updated_team = crud_team.add_checkpoint(
            db_session,
            id=team.id,
            checkpoint_id=1,
            obj_in=checkpoint_data
        )
        
        # Verify checkpoint time is in UTC
        checkpoint_time = updated_team.times[0]
        assert checkpoint_time.tzinfo is not None
        assert checkpoint_time.tzinfo.utcoffset(None).total_seconds() == 0
