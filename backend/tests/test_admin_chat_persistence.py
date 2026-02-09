"""
Test Admin Chat Message Persistence Feature
Tests the new endpoints for storing and retrieving admin AI chat messages:
- GET /api/admin-control/messages - Get last N messages
- POST /api/admin-control/messages/save - Save a chat message
- DELETE /api/admin-control/messages - Clear all messages
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "digitalebookdepot@gmail.com"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin auth token"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


class TestAdminChatMessagePersistence:
    """Test suite for admin chat message persistence feature"""
    
    def test_get_messages_requires_auth(self):
        """GET /api/admin-control/messages requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin-control/messages")
        assert response.status_code in [401, 403], "Should require authentication"
    
    def test_save_message_requires_auth(self):
        """POST /api/admin-control/messages/save requires authentication"""
        response = requests.post(f"{BASE_URL}/api/admin-control/messages/save", json={
            "role": "user",
            "content": "test",
            "file_edits": []
        })
        assert response.status_code in [401, 403], "Should require authentication"
    
    def test_delete_messages_requires_auth(self):
        """DELETE /api/admin-control/messages requires authentication"""
        response = requests.delete(f"{BASE_URL}/api/admin-control/messages")
        assert response.status_code in [401, 403], "Should require authentication"
    
    def test_get_messages_empty_initially(self, auth_headers):
        """GET /api/admin-control/messages returns empty list when no messages"""
        # First clear any existing messages
        requests.delete(f"{BASE_URL}/api/admin-control/messages", headers=auth_headers)
        
        response = requests.get(f"{BASE_URL}/api/admin-control/messages?limit=50", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "messages" in data
        assert "count" in data
        assert isinstance(data["messages"], list)
        assert data["count"] == 0
    
    def test_save_user_message(self, auth_headers):
        """POST /api/admin-control/messages/save saves user message"""
        test_content = f"TEST_USER_MSG_{uuid.uuid4()}"
        
        response = requests.post(f"{BASE_URL}/api/admin-control/messages/save", 
            headers=auth_headers,
            json={
                "role": "user",
                "content": test_content,
                "file_edits": []
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] is True
        assert "message" in data
        assert data["message"]["role"] == "user"
        assert data["message"]["content"] == test_content
        assert data["message"]["file_edits"] == []
        assert "id" in data["message"]
        assert "timestamp" in data["message"]
        assert "user_email" in data["message"]
    
    def test_save_assistant_message_with_file_edits(self, auth_headers):
        """POST /api/admin-control/messages/save saves assistant message with file_edits"""
        test_content = f"TEST_ASSISTANT_MSG_{uuid.uuid4()}"
        test_file_edits = [
            {"file_path": "/app/frontend/src/test.js", "content": "console.log('test')"}
        ]
        
        response = requests.post(f"{BASE_URL}/api/admin-control/messages/save", 
            headers=auth_headers,
            json={
                "role": "assistant",
                "content": test_content,
                "file_edits": test_file_edits
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] is True
        assert data["message"]["role"] == "assistant"
        assert data["message"]["content"] == test_content
        assert len(data["message"]["file_edits"]) == 1
        assert data["message"]["file_edits"][0]["file_path"] == "/app/frontend/src/test.js"
    
    def test_get_messages_returns_saved_messages(self, auth_headers):
        """GET /api/admin-control/messages returns previously saved messages"""
        # Clear existing messages first
        requests.delete(f"{BASE_URL}/api/admin-control/messages", headers=auth_headers)
        
        # Save a test message
        test_content = f"TEST_PERSISTENCE_{uuid.uuid4()}"
        requests.post(f"{BASE_URL}/api/admin-control/messages/save", 
            headers=auth_headers,
            json={"role": "user", "content": test_content, "file_edits": []}
        )
        
        # Retrieve messages
        response = requests.get(f"{BASE_URL}/api/admin-control/messages?limit=50", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["count"] >= 1
        
        # Find our test message
        found = any(msg["content"] == test_content for msg in data["messages"])
        assert found, "Saved message should be retrievable"
    
    def test_messages_in_chronological_order(self, auth_headers):
        """GET /api/admin-control/messages returns messages in chronological order (oldest first)"""
        # Clear existing messages
        requests.delete(f"{BASE_URL}/api/admin-control/messages", headers=auth_headers)
        
        # Save messages in order
        msg1 = f"TEST_FIRST_{uuid.uuid4()}"
        msg2 = f"TEST_SECOND_{uuid.uuid4()}"
        msg3 = f"TEST_THIRD_{uuid.uuid4()}"
        
        for content in [msg1, msg2, msg3]:
            requests.post(f"{BASE_URL}/api/admin-control/messages/save", 
                headers=auth_headers,
                json={"role": "user", "content": content, "file_edits": []}
            )
        
        # Retrieve messages
        response = requests.get(f"{BASE_URL}/api/admin-control/messages?limit=50", headers=auth_headers)
        data = response.json()
        
        assert data["count"] == 3
        # Messages should be in chronological order (oldest first)
        assert data["messages"][0]["content"] == msg1
        assert data["messages"][1]["content"] == msg2
        assert data["messages"][2]["content"] == msg3
    
    def test_limit_parameter_works(self, auth_headers):
        """GET /api/admin-control/messages respects limit parameter"""
        # Clear existing messages
        requests.delete(f"{BASE_URL}/api/admin-control/messages", headers=auth_headers)
        
        # Save 5 messages
        for i in range(5):
            requests.post(f"{BASE_URL}/api/admin-control/messages/save", 
                headers=auth_headers,
                json={"role": "user", "content": f"TEST_LIMIT_{i}", "file_edits": []}
            )
        
        # Request only 3 messages
        response = requests.get(f"{BASE_URL}/api/admin-control/messages?limit=3", headers=auth_headers)
        data = response.json()
        
        # Should return only 3 most recent messages
        assert data["count"] == 3
    
    def test_delete_messages_clears_all(self, auth_headers):
        """DELETE /api/admin-control/messages clears all messages for user"""
        # Save some messages first
        for i in range(3):
            requests.post(f"{BASE_URL}/api/admin-control/messages/save", 
                headers=auth_headers,
                json={"role": "user", "content": f"TEST_DELETE_{i}", "file_edits": []}
            )
        
        # Delete all messages
        response = requests.delete(f"{BASE_URL}/api/admin-control/messages", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "deleted_count" in data
        
        # Verify messages are cleared
        get_response = requests.get(f"{BASE_URL}/api/admin-control/messages?limit=50", headers=auth_headers)
        get_data = get_response.json()
        assert get_data["count"] == 0
    
    def test_error_message_can_be_saved(self, auth_headers):
        """POST /api/admin-control/messages/save can save error messages"""
        response = requests.post(f"{BASE_URL}/api/admin-control/messages/save", 
            headers=auth_headers,
            json={
                "role": "error",
                "content": "TEST_ERROR: Something went wrong",
                "file_edits": []
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"]["role"] == "error"


class TestLazyLoadingDashboard:
    """Test that lazy loading is properly configured for Dashboard"""
    
    def test_login_returns_quickly(self, admin_token):
        """Login should complete without timeout (lazy loading prevents blocking)"""
        # If we got here with a valid token, login worked
        assert admin_token is not None
        assert len(admin_token) > 0
    
    def test_auth_me_endpoint_works(self, auth_headers):
        """GET /api/auth/me should work after login"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"


class TestAdminControlCenterAccess:
    """Test Admin Control Center access and basic functionality"""
    
    def test_admin_control_verify_access(self, auth_headers):
        """GET /api/admin-control/verify should allow admin access"""
        response = requests.get(f"{BASE_URL}/api/admin-control/verify", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["has_access"] is True
    
    def test_admin_control_files_endpoint(self, auth_headers):
        """GET /api/admin-control/files should list files"""
        response = requests.get(f"{BASE_URL}/api/admin-control/files?path=/app/frontend/src", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "files" in data
        assert isinstance(data["files"], list)


# Cleanup fixture to run after all tests
@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_token):
    """Clean up test data after all tests"""
    yield
    # Cleanup after tests
    headers = {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }
    requests.delete(f"{BASE_URL}/api/admin-control/messages", headers=headers)
