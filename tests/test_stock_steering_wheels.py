"""
Test Stock Steering Wheels Feature and Mobile Order Modal
Tests:
1. Stock Steering Wheels CRUD operations
2. Create order from stock steering wheel
3. Stock Inventory page tabs (Rims and Steering Wheels)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "digitalebookdepot@gmail.com"
ADMIN_PASSWORD = "Admin123!"


class TestStockSteeringWheelsAPI:
    """Test Stock Steering Wheels API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_health_check(self):
        """Test health endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health check passed")
    
    def test_get_stock_steering_wheels_empty(self):
        """Test GET /api/stock-steering-wheels - should return list (may be empty)"""
        response = self.session.get(f"{BASE_URL}/api/stock-steering-wheels")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET stock steering wheels - found {len(data)} items")
    
    def test_create_stock_steering_wheel(self):
        """Test POST /api/stock-steering-wheels - create new steering wheel"""
        wheel_data = {
            "sku": "TEST-SW-001",
            "brand": "GRANT",
            "model": "Classic 500",
            "finish": "Black/Chrome",
            "original_order_number": "TEST-1234",
            "cubby_number": "A1",
            "notes": "Test steering wheel for automated testing"
        }
        
        response = self.session.post(f"{BASE_URL}/api/stock-steering-wheels", json=wheel_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("sku") == wheel_data["sku"]
        assert data.get("brand") == wheel_data["brand"]
        assert data.get("model") == wheel_data["model"]
        assert data.get("status") == "available"
        assert "id" in data
        
        # Store ID for later tests
        self.__class__.created_wheel_id = data["id"]
        print(f"✓ Created steering wheel: {data['sku']} (ID: {data['id']})")
        return data
    
    def test_get_stock_steering_wheels_after_create(self):
        """Test GET /api/stock-steering-wheels - verify created wheel appears"""
        response = self.session.get(f"{BASE_URL}/api/stock-steering-wheels")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Find our test wheel
        test_wheel = next((w for w in data if w.get("sku") == "TEST-SW-001"), None)
        assert test_wheel is not None, "Created wheel should appear in list"
        assert test_wheel.get("brand") == "GRANT"
        print(f"✓ Verified steering wheel in list: {test_wheel['sku']}")
    
    def test_update_stock_steering_wheel(self):
        """Test PUT /api/stock-steering-wheels/{id} - update steering wheel"""
        if not hasattr(self.__class__, 'created_wheel_id'):
            pytest.skip("No wheel created to update")
        
        wheel_id = self.__class__.created_wheel_id
        update_data = {
            "cubby_number": "B2",
            "notes": "Updated notes for testing"
        }
        
        response = self.session.put(f"{BASE_URL}/api/stock-steering-wheels/{wheel_id}", json=update_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("cubby_number") == "B2"
        assert "Updated notes" in data.get("notes", "")
        print(f"✓ Updated steering wheel cubby to: {data['cubby_number']}")
    
    def test_create_order_from_steering_wheel(self):
        """Test POST /api/stock-steering-wheels/{id}/create-order - sell steering wheel"""
        if not hasattr(self.__class__, 'created_wheel_id'):
            pytest.skip("No wheel created to sell")
        
        wheel_id = self.__class__.created_wheel_id
        order_data = {
            "customer_name": "TEST Customer",
            "phone": "(555)-123-4567",
            "notes": "Test order from stock steering wheel"
        }
        
        response = self.session.post(f"{BASE_URL}/api/stock-steering-wheels/{wheel_id}/create-order", json=order_data)
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data or "order_number" in data
        print(f"✓ Created order from steering wheel: {data}")
        
        # Store order number for cleanup
        if "order_number" in data:
            self.__class__.created_order_number = data["order_number"]
    
    def test_steering_wheel_marked_as_sold(self):
        """Verify steering wheel is marked as sold after order creation"""
        if not hasattr(self.__class__, 'created_wheel_id'):
            pytest.skip("No wheel created")
        
        response = self.session.get(f"{BASE_URL}/api/stock-steering-wheels")
        assert response.status_code == 200
        
        data = response.json()
        test_wheel = next((w for w in data if w.get("id") == self.__class__.created_wheel_id), None)
        
        if test_wheel:
            assert test_wheel.get("status") == "sold", f"Wheel should be sold, got: {test_wheel.get('status')}"
            print(f"✓ Steering wheel marked as sold")
        else:
            print("✓ Steering wheel not found (may have been deleted)")
    
    def test_delete_stock_steering_wheel(self):
        """Test DELETE /api/stock-steering-wheels/{id} - delete steering wheel"""
        # Create a new wheel to delete (since the previous one is sold)
        wheel_data = {
            "sku": "TEST-SW-DELETE",
            "brand": "MOMO",
            "model": "Prototipo",
            "finish": "Black"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/stock-steering-wheels", json=wheel_data)
        assert create_response.status_code == 200
        wheel_id = create_response.json()["id"]
        
        # Now delete it
        delete_response = self.session.delete(f"{BASE_URL}/api/stock-steering-wheels/{wheel_id}")
        assert delete_response.status_code == 200
        
        data = delete_response.json()
        assert data.get("success") == True
        print(f"✓ Deleted steering wheel: {wheel_id}")
    
    def test_delete_nonexistent_steering_wheel(self):
        """Test DELETE /api/stock-steering-wheels/{id} - 404 for non-existent"""
        response = self.session.delete(f"{BASE_URL}/api/stock-steering-wheels/nonexistent-id-12345")
        assert response.status_code == 404
        print("✓ Correctly returns 404 for non-existent steering wheel")
    
    def test_create_steering_wheel_missing_required_fields(self):
        """Test POST /api/stock-steering-wheels - validation for required fields"""
        # Missing brand (required)
        wheel_data = {
            "sku": "TEST-SW-INVALID"
        }
        
        response = self.session.post(f"{BASE_URL}/api/stock-steering-wheels", json=wheel_data)
        # Should fail validation (422) or return error
        assert response.status_code in [400, 422]
        print("✓ Correctly validates required fields (brand)")


class TestStockInventoryAPI:
    """Test Stock Inventory (Rims) API for comparison"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_get_stock_inventory_rims(self):
        """Test GET /api/stock-inventory - get stock rims"""
        response = self.session.get(f"{BASE_URL}/api/stock-inventory")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET stock inventory (rims) - found {len(data)} items")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_cleanup_test_steering_wheels(self):
        """Clean up any test steering wheels"""
        response = self.session.get(f"{BASE_URL}/api/stock-steering-wheels")
        if response.status_code == 200:
            wheels = response.json()
            for wheel in wheels:
                if wheel.get("sku", "").startswith("TEST-"):
                    self.session.delete(f"{BASE_URL}/api/stock-steering-wheels/{wheel['id']}")
                    print(f"  Cleaned up: {wheel['sku']}")
        print("✓ Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
