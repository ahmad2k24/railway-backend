"""
Test Stock Sell Redirect Bug Fix
Tests the new behavior where clicking 'Sell' on stock items navigates to dashboard
with pre-filled order form instead of directly creating an order.

Features tested:
1. Backend mark-sold endpoints for rims and steering wheels
2. Stock inventory API endpoints
3. Stock steering wheels API endpoints
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "digitalebookdepot@gmail.com"
ADMIN_PASSWORD = "Admin123!"


class TestStockSellRedirectBackend:
    """Backend API tests for stock sell redirect feature"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    # ============ HEALTH CHECK ============
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health check passed")
    
    # ============ STOCK INVENTORY (RIMS) ENDPOINTS ============
    def test_get_stock_inventory(self, auth_headers):
        """Test GET /api/stock-inventory returns list of stock rims"""
        response = requests.get(f"{BASE_URL}/api/stock-inventory", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Stock inventory endpoint works - {len(data)} items found")
    
    def test_create_stock_rim_for_testing(self, auth_headers):
        """Create a test stock rim for mark-sold testing"""
        test_sku = f"TEST-RIM-{uuid.uuid4().hex[:6].upper()}"
        stock_data = {
            "sku": test_sku,
            "name": "Test Rim for Sell Redirect",
            "size": "22",
            "bolt_pattern": "5x5",
            "cf_caps": "XXL",
            "finish": "Chrome",
            "fitment": "Ford Truck",
            "notes": "Test stock item"
        }
        response = requests.post(f"{BASE_URL}/api/stock-inventory", json=stock_data, headers=auth_headers)
        assert response.status_code in [200, 201]
        data = response.json()
        assert data.get("sku") == test_sku
        assert data.get("status") == "available"
        print(f"✓ Created test stock rim: {test_sku}")
        return data
    
    def test_mark_stock_rim_as_sold(self, auth_headers):
        """Test PUT /api/stock-inventory/{id}/mark-sold endpoint"""
        # First create a test stock rim
        test_sku = f"TEST-SELL-{uuid.uuid4().hex[:6].upper()}"
        stock_data = {
            "sku": test_sku,
            "name": "Test Rim for Mark Sold",
            "size": "24",
            "bolt_pattern": "6x135",
            "finish": "Black"
        }
        create_response = requests.post(f"{BASE_URL}/api/stock-inventory", json=stock_data, headers=auth_headers)
        assert create_response.status_code in [200, 201]
        stock_id = create_response.json().get("id")
        
        # Now mark it as sold
        mark_sold_response = requests.put(
            f"{BASE_URL}/api/stock-inventory/{stock_id}/mark-sold",
            json={"sold_to_order_number": "TEST-ORDER-123"},
            headers=auth_headers
        )
        assert mark_sold_response.status_code == 200
        data = mark_sold_response.json()
        assert data.get("success") == True
        assert "marked as sold" in data.get("message", "").lower()
        print(f"✓ Mark stock rim as sold endpoint works - {test_sku}")
        
        # Verify the stock is now marked as sold
        get_response = requests.get(f"{BASE_URL}/api/stock-inventory", headers=auth_headers)
        stock_items = get_response.json()
        sold_item = next((s for s in stock_items if s.get("id") == stock_id), None)
        if sold_item:
            assert sold_item.get("status") == "sold"
            assert sold_item.get("sold_to_order_number") == "TEST-ORDER-123"
            print(f"✓ Stock rim status verified as sold")
        
        # Cleanup - delete the test stock
        requests.delete(f"{BASE_URL}/api/stock-inventory/{stock_id}", headers=auth_headers)
    
    def test_mark_already_sold_rim_fails(self, auth_headers):
        """Test that marking an already sold rim fails with 400"""
        # Create and mark as sold
        test_sku = f"TEST-DOUBLE-{uuid.uuid4().hex[:6].upper()}"
        stock_data = {
            "sku": test_sku,
            "name": "Test Double Sell",
            "size": "20",
            "bolt_pattern": "5x5"
        }
        create_response = requests.post(f"{BASE_URL}/api/stock-inventory", json=stock_data, headers=auth_headers)
        stock_id = create_response.json().get("id")
        
        # First mark as sold
        requests.put(
            f"{BASE_URL}/api/stock-inventory/{stock_id}/mark-sold",
            json={"sold_to_order_number": "ORDER-1"},
            headers=auth_headers
        )
        
        # Try to mark as sold again - should fail
        second_response = requests.put(
            f"{BASE_URL}/api/stock-inventory/{stock_id}/mark-sold",
            json={"sold_to_order_number": "ORDER-2"},
            headers=auth_headers
        )
        assert second_response.status_code == 400
        assert "already sold" in second_response.json().get("detail", "").lower()
        print("✓ Double-sell prevention works for rims")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/stock-inventory/{stock_id}", headers=auth_headers)
    
    # ============ STOCK STEERING WHEELS ENDPOINTS ============
    def test_get_stock_steering_wheels(self, auth_headers):
        """Test GET /api/stock-steering-wheels returns list of steering wheels"""
        response = requests.get(f"{BASE_URL}/api/stock-steering-wheels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Stock steering wheels endpoint works - {len(data)} items found")
    
    def test_get_next_sku_for_steering_wheel(self, auth_headers):
        """Test GET /api/stock-steering-wheels/next-sku returns next SKU"""
        response = requests.get(f"{BASE_URL}/api/stock-steering-wheels/next-sku", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "next_sku" in data
        print(f"✓ Next SKU endpoint works - {data.get('next_sku')}")
    
    def test_create_stock_steering_wheel_for_testing(self, auth_headers):
        """Create a test steering wheel for mark-sold testing"""
        test_sku = f"SW-TEST-{uuid.uuid4().hex[:4].upper()}"
        wheel_data = {
            "sku": test_sku,
            "brand": "GRANT",
            "model": "Classic 500",
            "finish": "Black/Chrome",
            "notes": "Test steering wheel"
        }
        response = requests.post(f"{BASE_URL}/api/stock-steering-wheels", json=wheel_data, headers=auth_headers)
        assert response.status_code in [200, 201]
        data = response.json()
        assert data.get("sku") == test_sku
        assert data.get("status") == "available"
        print(f"✓ Created test steering wheel: {test_sku}")
        return data
    
    def test_mark_stock_steering_wheel_as_sold(self, auth_headers):
        """Test PUT /api/stock-steering-wheels/{id}/mark-sold endpoint"""
        # First create a test steering wheel
        test_sku = f"SW-SELL-{uuid.uuid4().hex[:4].upper()}"
        wheel_data = {
            "sku": test_sku,
            "brand": "MOMO",
            "model": "Prototipo",
            "finish": "Black"
        }
        create_response = requests.post(f"{BASE_URL}/api/stock-steering-wheels", json=wheel_data, headers=auth_headers)
        assert create_response.status_code in [200, 201]
        wheel_id = create_response.json().get("id")
        
        # Now mark it as sold
        mark_sold_response = requests.put(
            f"{BASE_URL}/api/stock-steering-wheels/{wheel_id}/mark-sold",
            json={"sold_to_order_number": "TEST-SW-ORDER-456"},
            headers=auth_headers
        )
        assert mark_sold_response.status_code == 200
        data = mark_sold_response.json()
        assert data.get("success") == True
        assert "marked as sold" in data.get("message", "").lower()
        print(f"✓ Mark steering wheel as sold endpoint works - {test_sku}")
        
        # Verify the wheel is now marked as sold
        get_response = requests.get(f"{BASE_URL}/api/stock-steering-wheels", headers=auth_headers)
        wheels = get_response.json()
        sold_wheel = next((w for w in wheels if w.get("id") == wheel_id), None)
        if sold_wheel:
            assert sold_wheel.get("status") == "sold"
            assert sold_wheel.get("sold_to_order_number") == "TEST-SW-ORDER-456"
            print(f"✓ Steering wheel status verified as sold")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/stock-steering-wheels/{wheel_id}", headers=auth_headers)
    
    def test_mark_already_sold_wheel_fails(self, auth_headers):
        """Test that marking an already sold steering wheel fails with 400"""
        # Create and mark as sold
        test_sku = f"SW-DBL-{uuid.uuid4().hex[:4].upper()}"
        wheel_data = {
            "sku": test_sku,
            "brand": "SPARCO",
            "model": "R383"
        }
        create_response = requests.post(f"{BASE_URL}/api/stock-steering-wheels", json=wheel_data, headers=auth_headers)
        wheel_id = create_response.json().get("id")
        
        # First mark as sold
        requests.put(
            f"{BASE_URL}/api/stock-steering-wheels/{wheel_id}/mark-sold",
            json={"sold_to_order_number": "SW-ORDER-1"},
            headers=auth_headers
        )
        
        # Try to mark as sold again - should fail
        second_response = requests.put(
            f"{BASE_URL}/api/stock-steering-wheels/{wheel_id}/mark-sold",
            json={"sold_to_order_number": "SW-ORDER-2"},
            headers=auth_headers
        )
        assert second_response.status_code == 400
        assert "already sold" in second_response.json().get("detail", "").lower()
        print("✓ Double-sell prevention works for steering wheels")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/stock-steering-wheels/{wheel_id}", headers=auth_headers)
    
    def test_mark_nonexistent_rim_fails(self, auth_headers):
        """Test that marking a non-existent rim fails with 404"""
        response = requests.put(
            f"{BASE_URL}/api/stock-inventory/nonexistent-id-12345/mark-sold",
            json={"sold_to_order_number": "TEST-ORDER"},
            headers=auth_headers
        )
        assert response.status_code == 404
        print("✓ Non-existent rim returns 404")
    
    def test_mark_nonexistent_wheel_fails(self, auth_headers):
        """Test that marking a non-existent steering wheel fails with 404"""
        response = requests.put(
            f"{BASE_URL}/api/stock-steering-wheels/nonexistent-id-12345/mark-sold",
            json={"sold_to_order_number": "TEST-ORDER"},
            headers=auth_headers
        )
        assert response.status_code == 404
        print("✓ Non-existent steering wheel returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
