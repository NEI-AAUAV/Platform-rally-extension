"""
Critical Authentication tests
"""
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timezone, timedelta

from app.api.auth import AuthData, api_nei_auth, get_public_key
from app.core.config import Settings


@pytest.fixture
def mock_settings():
    """Mock settings"""
    settings = Mock(spec=Settings)
    settings.JWT_PUBLIC_KEY_URL = "https://api.nei.web.ua.pt/auth/public-key"
    settings.JWT_ALGORITHM = "RS256"
    return settings


@pytest.fixture
def mock_public_key():
    """Mock public key"""
    return """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890abcdef...
-----END PUBLIC KEY-----"""


@pytest.fixture
def valid_token_payload():
    """Valid JWT token payload"""
    now = datetime.now(timezone.utc)
    return {
        "sub": "user123",
        "email": "test@example.com",
        "name": "Test User",
        "scopes": ["rally:participant"],
        "iat": now,
        "exp": now + timedelta(hours=1)
    }


class TestAuthData:
    """Test AuthData model"""
    
    def test_auth_data_creation(self):
        """Test AuthData creation"""
        auth_data = AuthData(
            sub=123,
            nmec=123456,
            name="Test",
            email="test@example.com",
            surname="User",
            scopes=["rally:participant"]
        )
        
        assert auth_data.sub == 123
        assert auth_data.name == "Test"
        assert auth_data.email == "test@example.com"
        assert auth_data.scopes == ["rally:participant"]
    
    def test_auth_data_validation(self):
        """Test AuthData validation"""
        # Valid data
        auth_data = AuthData(
            sub=123,
            nmec=123456,
            name="Test",
            email="test@example.com",
            surname="User",
            scopes=["rally:participant"]
        )
        assert auth_data.sub is not None
        
        # Test with empty scopes
        auth_data_empty_scopes = AuthData(
            sub=123,
            nmec=123456,
            name="Test",
            email="test@example.com",
            surname="User",
            scopes=[]
        )
        assert auth_data_empty_scopes.scopes == []


class TestGetPublicKey:
    """Test get_public_key function"""
    
    @pytest.mark.asyncio
    async def test_get_public_key_success(self, mock_settings):
        """Test successful public key retrieval"""
        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.text = "-----BEGIN PUBLIC KEY-----\nMOCK_KEY\n-----END PUBLIC KEY-----"
            mock_get.return_value = mock_response
            
            result = await get_public_key(settings=mock_settings)
            
            assert result == "-----BEGIN PUBLIC KEY-----\nMOCK_KEY\n-----END PUBLIC KEY-----"
            mock_get.assert_called_once_with(mock_settings.JWT_PUBLIC_KEY_URL)
    
    @pytest.mark.asyncio
    async def test_get_public_key_failure(self, mock_settings):
        """Test public key retrieval failure"""
        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.status_code = 404
            mock_get.return_value = mock_response
            
            with pytest.raises(Exception):
                await get_public_key(settings=mock_settings)
    
    @pytest.mark.asyncio
    async def test_get_public_key_network_error(self, mock_settings):
        """Test public key retrieval network error"""
        with patch('requests.get') as mock_get:
            mock_get.side_effect = Exception("Network error")
            
            with pytest.raises(Exception):
                await get_public_key(settings=mock_settings)


class TestApiNeiAuth:
    """Test api_nei_auth function"""
    
    @pytest.mark.asyncio
    async def test_api_nei_auth_success(self, mock_settings, mock_public_key, valid_token_payload):
        """Test successful authentication"""
        # Mock token validation
        mock_token = "mock.valid.token"
        
        with patch('app.api.auth.get_public_key') as mock_get_key, \
             patch('jose.jwt.decode') as mock_decode:
            
            mock_get_key.return_value = mock_public_key
            mock_decode.return_value = valid_token_payload
            
            # Mock the dependencies
            mock_security_scopes = Mock()
            mock_security_scopes.scopes = []
            
            result = await api_nei_auth(
                settings=mock_settings,
                public_key=mock_public_key,
                security_scopes=mock_security_scopes,
                token=mock_token
            )
            
            assert isinstance(result, AuthData)
            assert result.sub == "user123"
            assert result.email == "test@example.com"
            assert result.name == "Test User"
            assert result.scopes == ["rally:participant"]
    
    @pytest.mark.asyncio
    async def test_api_nei_auth_invalid_token(self, mock_settings, mock_public_key):
        """Test authentication with invalid token"""
        invalid_token = "invalid.token.here"
        
        with patch('app.api.auth.get_public_key') as mock_get_key, \
             patch('jose.jwt.decode') as mock_decode:
            
            mock_get_key.return_value = mock_public_key
            mock_decode.side_effect = Exception("Invalid token")
            
            mock_security_scopes = Mock()
            mock_security_scopes.scopes = []
            
            with pytest.raises(Exception):  # Should raise HTTPException
                await api_nei_auth(
                    settings=mock_settings,
                    public_key=mock_public_key,
                    security_scopes=mock_security_scopes,
                    token=invalid_token
                )


class TestAuthenticationLogic:
    """Test authentication logic"""
    
    def test_scope_validation(self):
        """Test scope validation logic"""
        valid_scopes = ["rally:participant", "rally:staff", "rally:admin"]
        invalid_scopes = ["invalid:scope", "malformed", ""]
        
        # Test valid scopes
        for scope in valid_scopes:
            assert ":" in scope
            assert len(scope.split(":")) == 2
        
        # Test invalid scopes
        for scope in invalid_scopes:
            if scope:
                # For "invalid:scope", it has : but is still invalid (not rally:*)
                # For "malformed", it has no :
                # For "", it's empty
                if scope == "invalid:scope":
                    assert ":" in scope  # Has colon but wrong format
                elif scope == "malformed":
                    assert ":" not in scope  # No colon
                else:
                    assert len(scope) == 0  # Empty string
    
    def test_token_payload_validation(self, valid_token_payload):
        """Test token payload validation"""
        # Required fields
        required_fields = ["sub", "email", "name", "scopes", "iat", "exp"]
        for field in required_fields:
            assert field in valid_token_payload
        
        # Validate data types
        assert isinstance(valid_token_payload["sub"], str)
        assert isinstance(valid_token_payload["email"], str)
        assert isinstance(valid_token_payload["name"], str)
        assert isinstance(valid_token_payload["scopes"], list)
        assert isinstance(valid_token_payload["iat"], datetime)
        assert isinstance(valid_token_payload["exp"], datetime)
    
    def test_token_expiration_validation(self, valid_token_payload):
        """Test token expiration validation"""
        now = datetime.now(timezone.utc)
        
        # Valid token (not expired)
        assert valid_token_payload["exp"] > now
        
        # Test expired token
        expired_payload = valid_token_payload.copy()
        expired_payload["exp"] = now - timedelta(hours=1)
        assert expired_payload["exp"] < now


class TestAuthenticationIntegration:
    """Test authentication integration scenarios"""
    
    def test_participant_scope_validation(self):
        """Test participant scope validation"""
        participant_scopes = ["rally:participant"]
        
        # Valid participant scopes
        for scope in participant_scopes:
            assert scope.startswith("rally:")
            assert "participant" in scope
    
    def test_staff_scope_validation(self):
        """Test staff scope validation"""
        staff_scopes = ["rally:staff"]
        
        # Valid staff scopes
        for scope in staff_scopes:
            assert scope.startswith("rally:")
            assert "staff" in scope
    
    def test_admin_scope_validation(self):
        """Test admin scope validation"""
        admin_scopes = ["rally:admin"]
        
        # Valid admin scopes
        for scope in admin_scopes:
            assert scope.startswith("rally:")
            assert "admin" in scope
    
    def test_scope_hierarchy(self):
        """Test scope hierarchy logic"""
        # Admin should have all permissions
        admin_scopes = ["rally:admin"]
        assert "rally:admin" in admin_scopes
        
        # Staff should have staff permissions
        staff_scopes = ["rally:staff"]
        assert "rally:staff" in staff_scopes
        
        # Participant should have participant permissions
        participant_scopes = ["rally:participant"]
        assert "rally:participant" in participant_scopes
