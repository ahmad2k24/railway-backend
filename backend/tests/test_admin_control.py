"""
Admin Control Center API Tests
Tests for: Access verification, File browser, File read/write, Rollback, AI Chat, Integrations
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://whsmonitor.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "digitalebookdepot@gmail.com"
ADMIN_PASSWORD = "Admin123!"
NON_ADMIN_EMAIL = "staff@test.com"
NON_ADMIN_PASSWORD = "Staff123!"


class TestAdminControlAccess:
    """Test access control for Admin Control Center"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        """Get headers with admin auth token"""
        return {
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        }
    
    def test_admin_login_success(self):
        """Test admin user can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        print(f"✓ Admin login successful for {ADMIN_EMAIL}")
    
    def test_admin_control_verify_access_granted(self, admin_headers):
        """Test admin user has access to Admin Control Center"""
        response = requests.get(f"{BASE_URL}/api/admin-control/verify", headers=admin_headers)
        assert response.status_code == 200, f"Verify access failed: {response.text}"
        data = response.json()
        assert data["has_access"] == True
        assert data["user_email"] == ADMIN_EMAIL
        print(f"✓ Admin access verified for {ADMIN_EMAIL}")
    
    def test_admin_control_verify_access_denied_no_auth(self):
        """Test unauthenticated user cannot access Admin Control Center"""
        response = requests.get(f"{BASE_URL}/api/admin-control/verify")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Unauthenticated access correctly denied")


class TestFileBrowser:
    """Test file browser functionality"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("token")
            return {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
        pytest.skip("Admin login failed")
    
    def test_list_files_default_path(self, admin_headers):
        """Test listing files in default /app/frontend/src path"""
        response = requests.get(f"{BASE_URL}/api/admin-control/files", headers=admin_headers)
        assert response.status_code == 200, f"List files failed: {response.text}"
        data = response.json()
        assert "files" in data
        assert "path" in data
        assert data["path"] == "/app/frontend/src"
        assert len(data["files"]) > 0
        
        # Verify file structure
        file_names = [f["name"] for f in data["files"]]
        assert "App.js" in file_names or "index.js" in file_names, f"Expected App.js or index.js in {file_names}"
        print(f"✓ Listed {len(data['files'])} files in /app/frontend/src")
    
    def test_list_files_pages_directory(self, admin_headers):
        """Test listing files in pages directory"""
        response = requests.get(
            f"{BASE_URL}/api/admin-control/files?path=/app/frontend/src/pages",
            headers=admin_headers
        )
        assert response.status_code == 200, f"List pages failed: {response.text}"
        data = response.json()
        assert "files" in data
        
        # Should contain AdminControlPage.jsx
        file_names = [f["name"] for f in data["files"]]
        assert "AdminControlPage.jsx" in file_names, f"AdminControlPage.jsx not found in {file_names}"
        print(f"✓ Listed {len(data['files'])} files in /app/frontend/src/pages")
    
    def test_list_files_disallowed_path(self, admin_headers):
        """Test that disallowed paths are rejected"""
        response = requests.get(
            f"{BASE_URL}/api/admin-control/files?path=/app/backend",
            headers=admin_headers
        )
        assert response.status_code == 403, f"Expected 403 for disallowed path, got {response.status_code}"
        print("✓ Disallowed path correctly rejected")


class TestFileReadWrite:
    """Test file read and write operations"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("token")
            return {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
        pytest.skip("Admin login failed")
    
    def test_read_file_success(self, admin_headers):
        """Test reading a file successfully"""
        response = requests.post(
            f"{BASE_URL}/api/admin-control/read-file",
            headers=admin_headers,
            json={"file_path": "/app/frontend/src/App.js"}
        )
        assert response.status_code == 200, f"Read file failed: {response.text}"
        data = response.json()
        assert "content" in data
        assert "file_path" in data
        assert "lines" in data
        assert data["file_path"] == "/app/frontend/src/App.js"
        assert len(data["content"]) > 0
        assert "import" in data["content"]  # Should contain import statements
        print(f"✓ Read App.js successfully ({data['lines']} lines, {data['size']} bytes)")
    
    def test_read_file_not_found(self, admin_headers):
        """Test reading a non-existent file"""
        response = requests.post(
            f"{BASE_URL}/api/admin-control/read-file",
            headers=admin_headers,
            json={"file_path": "/app/frontend/src/NonExistent.jsx"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent file correctly returns 404")
    
    def test_read_file_disallowed_path(self, admin_headers):
        """Test reading from disallowed path"""
        response = requests.post(
            f"{BASE_URL}/api/admin-control/read-file",
            headers=admin_headers,
            json={"file_path": "/app/backend/server.py"}
        )
        assert response.status_code == 403, f"Expected 403 for disallowed path, got {response.status_code}"
        print("✓ Disallowed path correctly rejected for read")


class TestRollbackHistory:
    """Test rollback history functionality"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("token")
            return {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
        pytest.skip("Admin login failed")
    
    def test_get_rollback_history(self, admin_headers):
        """Test getting rollback history"""
        response = requests.get(
            f"{BASE_URL}/api/admin-control/rollback-history",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Get rollback history failed: {response.text}"
        data = response.json()
        assert "edits" in data
        assert "max_history" in data
        assert data["max_history"] == 10
        print(f"✓ Retrieved rollback history ({len(data['edits'])} edits)")


class TestAIChat:
    """Test AI Chat functionality"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("token")
            return {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
        pytest.skip("Admin login failed")
    
    def test_chat_simple_message(self, admin_headers):
        """Test sending a simple chat message to AI"""
        response = requests.post(
            f"{BASE_URL}/api/admin-control/chat",
            headers=admin_headers,
            json={
                "message": "Hello, what can you help me with?",
                "session_id": f"test-session-{int(time.time())}"
            },
            timeout=60  # AI responses can take time
        )
        
        # Handle rate limiting gracefully
        if response.status_code == 429:
            print("⚠ AI Chat rate limited (429) - this is expected on free tier")
            pytest.skip("AI Chat rate limited - skipping test")
        
        assert response.status_code == 200, f"Chat failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "response" in data
        assert "session_id" in data
        assert len(data["response"]) > 0
        print(f"✓ AI Chat responded successfully ({len(data['response'])} chars)")
    
    def test_chat_without_auth(self):
        """Test chat endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/admin-control/chat",
            json={"message": "Hello"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Chat endpoint correctly requires authentication")


class TestIntegrations:
    """Test API Integrations management"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("token")
            return {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
        pytest.skip("Admin login failed")
    
    def test_list_integrations(self, admin_headers):
        """Test listing integrations"""
        response = requests.get(
            f"{BASE_URL}/api/admin-control/integrations",
            headers=admin_headers
        )
        assert response.status_code == 200, f"List integrations failed: {response.text}"
        data = response.json()
        assert "integrations" in data
        print(f"✓ Listed {len(data['integrations'])} integrations")
    
    def test_create_integration(self, admin_headers):
        """Test creating a new integration"""
        test_integration = {
            "name": f"TEST_Integration_{int(time.time())}",
            "url": "https://api.test.com",
            "api_key": "test_api_key_12345",
            "description": "Test integration for automated testing"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/admin-control/integrations",
            headers=admin_headers,
            json=test_integration
        )
        assert response.status_code == 200, f"Create integration failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        assert "integration" in data
        assert data["integration"]["name"] == test_integration["name"]
        
        # Store integration ID for cleanup
        integration_id = data["integration"]["id"]
        print(f"✓ Created integration: {test_integration['name']}")
        
        # Cleanup - delete the test integration
        delete_response = requests.delete(
            f"{BASE_URL}/api/admin-control/integrations/{integration_id}",
            headers=admin_headers
        )
        assert delete_response.status_code == 200, f"Delete integration failed: {delete_response.text}"
        print(f"✓ Cleaned up test integration")
    
    def test_create_duplicate_integration(self, admin_headers):
        """Test that duplicate integration names are rejected"""
        test_name = f"TEST_Duplicate_{int(time.time())}"
        test_integration = {
            "name": test_name,
            "url": "https://api.test.com",
            "api_key": "test_key_1",
            "description": "First integration"
        }
        
        # Create first integration
        response1 = requests.post(
            f"{BASE_URL}/api/admin-control/integrations",
            headers=admin_headers,
            json=test_integration
        )
        assert response1.status_code == 200
        integration_id = response1.json()["integration"]["id"]
        
        # Try to create duplicate
        response2 = requests.post(
            f"{BASE_URL}/api/admin-control/integrations",
            headers=admin_headers,
            json=test_integration
        )
        assert response2.status_code == 400, f"Expected 400 for duplicate, got {response2.status_code}"
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin-control/integrations/{integration_id}",
            headers=admin_headers
        )
        print("✓ Duplicate integration correctly rejected")
    
    def test_delete_nonexistent_integration(self, admin_headers):
        """Test deleting a non-existent integration"""
        response = requests.delete(
            f"{BASE_URL}/api/admin-control/integrations/nonexistent-id-12345",
            headers=admin_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent integration delete returns 404")


class TestAccessDeniedForNonAdmin:
    """Test that non-admin users cannot access Admin Control Center"""
    
    def test_non_admin_access_denied(self):
        """Test that non-admin user cannot access Admin Control Center"""
        # First, try to login as non-admin (may not exist)
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NON_ADMIN_EMAIL,
            "password": NON_ADMIN_PASSWORD
        })
        
        if response.status_code != 200:
            # Non-admin user doesn't exist, skip this test
            print("⚠ Non-admin test user doesn't exist - skipping access denial test")
            pytest.skip("Non-admin test user not available")
        
        token = response.json().get("token")
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        # Try to access Admin Control Center
        verify_response = requests.get(
            f"{BASE_URL}/api/admin-control/verify",
            headers=headers
        )
        
        if verify_response.status_code == 200:
            data = verify_response.json()
            assert data["has_access"] == False, "Non-admin should not have access"
            print(f"✓ Non-admin user correctly denied access")
        else:
            # 403 is also acceptable
            assert verify_response.status_code == 403
            print(f"✓ Non-admin user correctly denied access (403)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
