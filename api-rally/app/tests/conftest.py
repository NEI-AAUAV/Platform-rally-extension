import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from unittest.mock import patch

from app.models.base import Base
from app.main import app
from app.api.deps import get_db
from app.api.auth import get_public_key

# Test database setup - Use SQLite with JSON for array-like data
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Export Session for other test files
Session = TestingSessionLocal


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="function")
def db():
    """Create a fresh database for each test"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


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
def client():
    """Create test client"""
    return TestClient(app)


@pytest.fixture
def mock_auth():
    """Mock authentication for tests"""
    from unittest.mock import patch
    
    with patch('app.api.api_v1.team_members.require_team_management_permission'):
        with patch('app.api.api_v1.teams.require_team_management_permission'):
            with patch('app.api.api_v1.rally_settings.require_team_management_permission'):
                yield


@pytest.fixture
def mock_public_key():
    """Mock JWT public key for tests"""
    from unittest.mock import patch
    
    # Mock the get_public_key function to return a dummy public key
    mock_key = """-----BEGIN PUBLIC KEY-----
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE8KdO8QqgT2zSM0p1KgJ4Y4vVXlJ7S8wK
9Y2Z3X4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D9E0F1G2H3I4J5K6L7M8N9O0P1Q2R
3S4T5U6V7W8X9Y0Z1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X
-----END PUBLIC KEY-----"""
    
    with patch('app.api.auth.get_public_key', return_value=mock_key):
        yield


@pytest.fixture
def client_with_mocked_db():
    """Create test client with mocked database and auth"""
    with patch('app.api.auth.get_public_key', return_value="mock_public_key"):
        return TestClient(app)