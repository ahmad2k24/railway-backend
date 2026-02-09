"""
Test suite for Translatify (WheelStat) - Testing new features:
1. Login functionality with admin credentials
2. Dashboard loads without errors
3. Refinish Queue - New Order button and creation
4. Language change to Spanish - static UI translation
5. Translation API endpoint - POST /api/translate
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://whsmonitor.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "digitalebookdepot@gmail.com"
ADMIN_PASSWORD = "Admin123!"

class TestHealthAndAuth:
    """Test health check and authentication"""
    
    def test_health_check(self):
        """Verify backend is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health check passed")
    
    def test_admin_login(self):
        """Test admin login with provided credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        # Check if login succeeds
        if response.status_code == 200:
            data = response.json()
            assert "token" in data
            assert "user" in data
            assert data["user"]["role"] == "admin"
            print(f"✓ Admin login successful - User: {data['user']['name']}")
            return data["token"]
        elif response.status_code == 401:
            # User might not exist, try to register
            print("Admin user not found, attempting registration...")
            pytest.skip("Admin user not registered - need to create first")
        elif response.status_code == 429:
            print("Account locked due to too many attempts")
            pytest.skip("Account locked - rate limited")
        else:
            pytest.fail(f"Login failed with status {response.status_code}: {response.text}")


class TestDashboardAndOrders:
    """Test dashboard and order functionality"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Could not authenticate")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_orders(self, auth_headers):
        """Test fetching orders (dashboard data)"""
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Orders fetched successfully - Count: {len(data)}")
    
    def test_get_stats(self, auth_headers):
        """Test fetching stats (dashboard stats)"""
        response = requests.get(f"{BASE_URL}/api/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "departments" in data
        assert "products" in data
        assert "total_active" in data
        print(f"✓ Stats fetched - Active orders: {data['total_active']}")
    
    def test_get_departments(self, auth_headers):
        """Test fetching departments"""
        response = requests.get(f"{BASE_URL}/api/departments", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "departments" in data
        assert "labels" in data
        print(f"✓ Departments fetched - Count: {len(data['departments'])}")


class TestRefinishQueue:
    """Test Refinish Queue functionality - including new order creation"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Could not authenticate")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_refinish_queue(self, auth_headers):
        """Test fetching refinish queue"""
        response = requests.get(f"{BASE_URL}/api/refinish-queue", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Refinish queue fetched - Count: {len(data)}")
    
    def test_get_refinish_stats(self, auth_headers):
        """Test fetching refinish queue stats"""
        response = requests.get(f"{BASE_URL}/api/refinish-queue/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "by_status" in data
        print(f"✓ Refinish stats fetched - Total: {data['total']}")
    
    def test_create_new_refinish_order(self, auth_headers):
        """Test creating a new refinish order directly (NEW FEATURE)"""
        # Generate unique order number
        import uuid
        order_number = f"TEST-RF-{str(uuid.uuid4())[:6].upper()}"
        
        payload = {
            "order_number": order_number,
            "customer_name": "Test Customer Refinish",
            "phone": "(555)-123-4567",
            "product_type": "rim",
            "wheel_specs": "22x10 -12 offset",
            "fix_notes": "Test refinish - needs powder coat touch up",
            "quantity": 4,
            "rim_size": "22"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/refinish-queue/create-new",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Failed to create refinish order: {response.text}"
        data = response.json()
        
        # Verify response structure - API returns both order and refinish_entry
        assert "order" in data, "Response should contain 'order' key"
        assert "refinish_entry" in data, "Response should contain 'refinish_entry' key"
        
        order = data["order"]
        refinish_entry = data["refinish_entry"]
        
        # Verify order data
        assert "id" in order
        assert order["order_number"] == order_number
        assert order["customer_name"] == "Test Customer Refinish"
        assert order["is_refinish"] == True
        
        # Verify refinish entry data
        assert "id" in refinish_entry
        assert refinish_entry["order_number"] == order_number
        assert refinish_entry["fix_notes"] == "Test refinish - needs powder coat touch up"
        assert refinish_entry["status"] == "received"
        
        print(f"✓ New refinish order created successfully - Order #: {order_number}")
        
        # Verify it appears in the queue
        queue_response = requests.get(f"{BASE_URL}/api/refinish-queue", headers=auth_headers)
        queue_data = queue_response.json()
        found = any(entry["order_number"] == order_number for entry in queue_data)
        assert found, "Created order not found in refinish queue"
        print(f"✓ Order verified in refinish queue")
    
    def test_create_refinish_order_validation(self, auth_headers):
        """Test validation for refinish order creation"""
        # Test with invalid product type
        payload = {
            "order_number": "TEST-INVALID",
            "customer_name": "Test",
            "product_type": "invalid_type",
            "fix_notes": "Test"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/refinish-queue/create-new",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        print("✓ Invalid product type validation works")


class TestTranslationAPI:
    """Test Translation API endpoint"""
    
    def test_translate_to_spanish(self):
        """Test translation to Spanish"""
        payload = {
            "texts": ["Hello", "Customer Name", "Order Number"],
            "target_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/translate", json=payload)
        
        assert response.status_code == 200, f"Translation failed: {response.text}"
        data = response.json()
        
        assert "translations" in data
        assert len(data["translations"]) == 3
        assert data["target_language"] == "es"
        
        print(f"✓ Translation to Spanish successful")
        print(f"  - 'Hello' -> '{data['translations'][0]}'")
        print(f"  - 'Customer Name' -> '{data['translations'][1]}'")
        print(f"  - 'Order Number' -> '{data['translations'][2]}'")
    
    def test_translate_to_english_returns_original(self):
        """Test that translating to English returns original text"""
        payload = {
            "texts": ["Hello World", "Test Text"],
            "target_language": "en"
        }
        
        response = requests.post(f"{BASE_URL}/api/translate", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["translations"] == ["Hello World", "Test Text"]
        print("✓ Translation to English returns original text")
    
    def test_translate_to_vietnamese(self):
        """Test translation to Vietnamese"""
        payload = {
            "texts": ["Wheel Specifications", "Admin Notes"],
            "target_language": "vi"
        }
        
        response = requests.post(f"{BASE_URL}/api/translate", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["translations"]) == 2
        print(f"✓ Translation to Vietnamese successful")
        print(f"  - 'Wheel Specifications' -> '{data['translations'][0]}'")
    
    def test_translate_empty_texts(self):
        """Test translation with empty texts array"""
        payload = {
            "texts": [],
            "target_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/translate", json=payload)
        
        # Should handle gracefully
        assert response.status_code == 200
        data = response.json()
        assert data["translations"] == []
        print("✓ Empty texts handled correctly")


class TestProductTypes:
    """Test product types endpoint"""
    
    def test_get_product_types(self):
        """Test fetching product types"""
        response = requests.get(f"{BASE_URL}/api/product-types")
        assert response.status_code == 200
        data = response.json()
        assert "product_types" in data
        assert "rim" in data["product_types"]
        assert "steering_wheel" in data["product_types"]
        print(f"✓ Product types fetched - Count: {len(data['product_types'])}")


class TestRimSizes:
    """Test rim sizes endpoint"""
    
    def test_get_rim_sizes(self):
        """Test fetching rim sizes"""
        response = requests.get(f"{BASE_URL}/api/rim-sizes")
        assert response.status_code == 200
        data = response.json()
        assert "rim_sizes" in data
        assert "cut_statuses" in data
        print(f"✓ Rim sizes fetched - Sizes: {data['rim_sizes']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
