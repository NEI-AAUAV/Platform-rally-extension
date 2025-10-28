import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from unittest.mock import patch, mock_open, Mock
import builtins

# Mock the public key BEFORE importing anything that uses it
mock_key = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890abcdefghijklmnopqrstuvwxyz
ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRST
UVWXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abc
defghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuv
wxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO
PQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456789
0abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqr
-----END PUBLIC KEY-----"""

# Mock open() to intercept JWT key file reads globally
_original_open = builtins.open

def mock_file_open(*args, **kwargs):
    # If trying to open a JWT key file, return mock content
    if len(args) > 0 and ('jwt.key' in str(args[0]) or 'public' in str(args[0]).lower()):
        return mock_open(read_data=mock_key)(*args, **kwargs)
    return _original_open(*args, **kwargs)

# Replace builtin open function
builtins.open = mock_file_open

# Now import app and other dependencies
from app.models.base import Base
from app.main import app
from app.api.deps import get_db

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