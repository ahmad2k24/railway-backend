"""
Test Suite for Session 6 Features:
1. Steering wheel brand auto-uppercase on order creation and update
2. Tire size field saved on rim orders
3. RUSH order move-to endpoint allows skipping departments
4. Customer search and customer orders endpoints
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "digitalebookdepot@gmail.com"
ADMIN_PASSWORD = "Admin123!"


class TestSession6Features:
    """Test suite for Session 6 new features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        
        # Cleanup - delete test orders
        self._cleanup_test_orders()
    
    def _cleanup_test_orders(self):
        """Clean up test orders created during tests"""
        try:
            # Search for test orders
            search_res = self.session.get(f"{BASE_URL}/api/orders/search?q=TEST-S6")
            if search_res.status_code == 200:
                for order in search_res.json():
                    self.session.delete(f"{BASE_URL}/api/orders/{order['id']}")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    # ============ STEERING WHEEL BRAND AUTO-UPPERCASE TESTS ============
    
    def test_steering_wheel_brand_uppercase_on_create(self):
        """Test that steering_wheel_brand is auto-uppercased on order creation"""
        # Create order with lowercase brand
        order_data = {
            "order_number": "TEST-S6-SW-001",
            "customer_name": "Test Customer",
            "product_type": "steering_wheel",
            "steering_wheel_brand": "grant",  # lowercase
            "wheel_specs": "Test specs"
        }
        
        res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert res.status_code == 200, f"Create order failed: {res.text}"
        
        order = res.json()
        assert order["steering_wheel_brand"] == "GRANT", f"Expected 'GRANT', got '{order['steering_wheel_brand']}'"
        print(f"✓ Steering wheel brand auto-uppercased on create: 'grant' -> '{order['steering_wheel_brand']}'")
    
    def test_steering_wheel_brand_uppercase_on_update(self):
        """Test that steering_wheel_brand is auto-uppercased on order update"""
        # First create an order
        order_data = {
            "order_number": "TEST-S6-SW-002",
            "customer_name": "Test Customer",
            "product_type": "steering_wheel",
            "steering_wheel_brand": "MOMO",
            "wheel_specs": "Test specs"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code == 200, f"Create order failed: {create_res.text}"
        order_id = create_res.json()["id"]
        
        # Update with lowercase brand
        update_res = self.session.put(f"{BASE_URL}/api/orders/{order_id}", json={
            "steering_wheel_brand": "nardi"  # lowercase
        })
        assert update_res.status_code == 200, f"Update order failed: {update_res.text}"
        
        updated_order = update_res.json()
        assert updated_order["steering_wheel_brand"] == "NARDI", f"Expected 'NARDI', got '{updated_order['steering_wheel_brand']}'"
        print(f"✓ Steering wheel brand auto-uppercased on update: 'nardi' -> '{updated_order['steering_wheel_brand']}'")
    
    def test_steering_wheel_brand_mixed_case(self):
        """Test that mixed case brand is uppercased"""
        order_data = {
            "order_number": "TEST-S6-SW-003",
            "customer_name": "Test Customer",
            "product_type": "steering_wheel",
            "steering_wheel_brand": "SpaRcO",  # mixed case
            "wheel_specs": "Test specs"
        }
        
        res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert res.status_code == 200, f"Create order failed: {res.text}"
        
        order = res.json()
        assert order["steering_wheel_brand"] == "SPARCO", f"Expected 'SPARCO', got '{order['steering_wheel_brand']}'"
        print(f"✓ Mixed case brand uppercased: 'SpaRcO' -> '{order['steering_wheel_brand']}'")
    
    # ============ TIRE SIZE FIELD TESTS ============
    
    def test_tire_size_saved_on_rim_order(self):
        """Test that tire_size field is saved when creating rim order with has_tires=true"""
        order_data = {
            "order_number": "TEST-S6-TIRE-001",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10 -12 offset",
            "has_tires": True,
            "tire_size": "305/35R24"
        }
        
        res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert res.status_code == 200, f"Create order failed: {res.text}"
        
        order = res.json()
        assert order["has_tires"] == True, "has_tires should be True"
        assert order["tire_size"] == "305/35R24", f"Expected '305/35R24', got '{order['tire_size']}'"
        print(f"✓ Tire size saved on rim order: '{order['tire_size']}'")
    
    def test_tire_size_in_order_detail(self):
        """Test that tire_size is returned in order detail when has_tires=true"""
        # Create order with tire size
        order_data = {
            "order_number": "TEST-S6-TIRE-002",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "24x12 -44 offset",
            "has_tires": True,
            "tire_size": "275/40R20"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code == 200, f"Create order failed: {create_res.text}"
        order_id = create_res.json()["id"]
        
        # Get order detail
        detail_res = self.session.get(f"{BASE_URL}/api/orders/{order_id}")
        assert detail_res.status_code == 200, f"Get order failed: {detail_res.text}"
        
        order = detail_res.json()
        assert order["has_tires"] == True
        assert order["tire_size"] == "275/40R20"
        print(f"✓ Tire size displayed in order detail: '{order['tire_size']}'")
    
    def test_tire_size_update(self):
        """Test that tire_size can be updated"""
        # Create order
        order_data = {
            "order_number": "TEST-S6-TIRE-003",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10",
            "has_tires": True,
            "tire_size": "265/35R22"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code == 200
        order_id = create_res.json()["id"]
        
        # Update tire size
        update_res = self.session.put(f"{BASE_URL}/api/orders/{order_id}", json={
            "tire_size": "285/35R22"
        })
        assert update_res.status_code == 200
        
        updated_order = update_res.json()
        assert updated_order["tire_size"] == "285/35R22"
        print(f"✓ Tire size updated: '265/35R22' -> '{updated_order['tire_size']}'")
    
    # ============ RUSH ORDER MOVE-TO ENDPOINT TESTS ============
    
    def test_rush_order_move_to_any_department(self):
        """Test that RUSH orders can be moved to any department (skip steps)"""
        # Create order
        order_data = {
            "order_number": "TEST-S6-RUSH-001",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code == 200
        order_id = create_res.json()["id"]
        
        # Mark as RUSH
        rush_res = self.session.put(f"{BASE_URL}/api/orders/{order_id}/rush", json={
            "is_rush": True,
            "rush_reason": "Test rush order"
        })
        assert rush_res.status_code == 200
        
        # Move from received (design) directly to machine (skipping program)
        move_res = self.session.put(f"{BASE_URL}/api/rush-queue/{order_id}/move-to", json={
            "target_department": "machine"
        })
        assert move_res.status_code == 200, f"Move failed: {move_res.text}"
        
        moved_order = move_res.json()
        assert moved_order["current_department"] == "machine", f"Expected 'machine', got '{moved_order['current_department']}'"
        print(f"✓ RUSH order moved from 'received' to 'machine' (skipped design, program, machine_waiting)")
    
    def test_rush_order_move_to_completed(self):
        """Test that RUSH orders can be moved directly to completed"""
        # Create order
        order_data = {
            "order_number": "TEST-S6-RUSH-002",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "24x12"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code == 200
        order_id = create_res.json()["id"]
        
        # Mark as RUSH
        rush_res = self.session.put(f"{BASE_URL}/api/orders/{order_id}/rush", json={
            "is_rush": True,
            "rush_reason": "Urgent completion"
        })
        assert rush_res.status_code == 200
        
        # Move directly to completed
        move_res = self.session.put(f"{BASE_URL}/api/rush-queue/{order_id}/move-to", json={
            "target_department": "completed"
        })
        assert move_res.status_code == 200, f"Move failed: {move_res.text}"
        
        moved_order = move_res.json()
        assert moved_order["current_department"] == "completed"
        assert moved_order["status"] == "completed"
        assert moved_order["final_status"] == "completed"
        print(f"✓ RUSH order moved directly to 'completed'")
    
    def test_non_rush_order_cannot_skip_departments(self):
        """Test that non-RUSH orders cannot use the move-to endpoint"""
        # Create order (not RUSH)
        order_data = {
            "order_number": "TEST-S6-RUSH-003",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "20x9"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code == 200
        order_id = create_res.json()["id"]
        
        # Try to use move-to endpoint (should fail)
        move_res = self.session.put(f"{BASE_URL}/api/rush-queue/{order_id}/move-to", json={
            "target_department": "machine"
        })
        assert move_res.status_code == 400, f"Expected 400, got {move_res.status_code}"
        assert "RUSH" in move_res.json().get("detail", "")
        print(f"✓ Non-RUSH order correctly rejected from move-to endpoint")
    
    def test_rush_order_move_invalid_department(self):
        """Test that move-to rejects invalid department"""
        # Create and mark as RUSH
        order_data = {
            "order_number": "TEST-S6-RUSH-004",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code == 200
        order_id = create_res.json()["id"]
        
        rush_res = self.session.put(f"{BASE_URL}/api/orders/{order_id}/rush", json={
            "is_rush": True
        })
        assert rush_res.status_code == 200
        
        # Try invalid department
        move_res = self.session.put(f"{BASE_URL}/api/rush-queue/{order_id}/move-to", json={
            "target_department": "invalid_dept"
        })
        assert move_res.status_code == 400
        print(f"✓ Invalid department correctly rejected")
    
    # ============ CUSTOMER SEARCH ENDPOINT TESTS ============
    
    def test_customer_search_returns_matching_customers(self):
        """Test that customer search returns matching customers with order count"""
        # First create some test orders with a unique customer name
        for i in range(3):
            order_data = {
                "order_number": f"TEST-S6-CUST-{i:03d}",
                "customer_name": "TestDealerXYZ",
                "product_type": "rim",
                "wheel_specs": f"22x{10+i}"
            }
            self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        
        # Search for the customer
        search_res = self.session.get(f"{BASE_URL}/api/customers/search?q=TestDealerXYZ")
        assert search_res.status_code == 200, f"Search failed: {search_res.text}"
        
        results = search_res.json()
        assert len(results) > 0, "Expected at least one customer result"
        
        # Find our test customer
        test_customer = next((c for c in results if c["name"] == "TestDealerXYZ"), None)
        assert test_customer is not None, "TestDealerXYZ not found in results"
        assert test_customer["order_count"] >= 3, f"Expected at least 3 orders, got {test_customer['order_count']}"
        print(f"✓ Customer search returned '{test_customer['name']}' with {test_customer['order_count']} orders")
    
    def test_customer_search_partial_match(self):
        """Test that customer search works with partial name"""
        # Create order with unique customer name
        order_data = {
            "order_number": "TEST-S6-CUST-PART-001",
            "customer_name": "UniqueTestCustomer123",
            "product_type": "rim",
            "wheel_specs": "22x10"
        }
        self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        
        # Search with partial name
        search_res = self.session.get(f"{BASE_URL}/api/customers/search?q=UniqueTest")
        assert search_res.status_code == 200
        
        results = search_res.json()
        matching = [c for c in results if "UniqueTest" in c["name"]]
        assert len(matching) > 0, "Expected partial match to return results"
        print(f"✓ Partial customer search works: found {len(matching)} matches for 'UniqueTest'")
    
    def test_customer_search_minimum_length(self):
        """Test that customer search requires minimum 2 characters"""
        # Search with 1 character
        search_res = self.session.get(f"{BASE_URL}/api/customers/search?q=T")
        assert search_res.status_code == 200
        
        results = search_res.json()
        assert results == [], "Expected empty results for single character search"
        print(f"✓ Customer search correctly requires minimum 2 characters")
    
    # ============ CUSTOMER ORDERS ENDPOINT TESTS ============
    
    def test_customer_orders_returns_all_orders(self):
        """Test that customer orders endpoint returns all orders for a customer"""
        # Create multiple orders for a unique customer
        customer_name = "TestDealerOrders123"
        for i in range(4):
            order_data = {
                "order_number": f"TEST-S6-CORD-{i:03d}",
                "customer_name": customer_name,
                "product_type": "rim" if i < 2 else "steering_wheel",
                "wheel_specs": f"22x{10+i}",
                "steering_wheel_brand": "GRANT" if i >= 2 else ""
            }
            self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        
        # Get customer orders
        orders_res = self.session.get(f"{BASE_URL}/api/customers/{customer_name}/orders")
        assert orders_res.status_code == 200, f"Get orders failed: {orders_res.text}"
        
        data = orders_res.json()
        assert data["customer_name"] == customer_name
        assert data["total_orders"] >= 4, f"Expected at least 4 orders, got {data['total_orders']}"
        assert "orders" in data
        assert "by_department" in data
        print(f"✓ Customer orders returned {data['total_orders']} orders with department breakdown")
    
    def test_customer_orders_department_breakdown(self):
        """Test that customer orders includes department breakdown"""
        customer_name = "TestDealerDeptBreakdown"
        
        # Create order
        order_data = {
            "order_number": "TEST-S6-DEPT-001",
            "customer_name": customer_name,
            "product_type": "rim",
            "wheel_specs": "22x10"
        }
        self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        
        # Get customer orders
        orders_res = self.session.get(f"{BASE_URL}/api/customers/{customer_name}/orders")
        assert orders_res.status_code == 200
        
        data = orders_res.json()
        assert "by_department" in data
        assert isinstance(data["by_department"], dict)
        # New orders start in "received" department
        assert "received" in data["by_department"] or data["total_orders"] == 0
        print(f"✓ Customer orders includes department breakdown: {data['by_department']}")
    
    def test_customer_orders_rush_count(self):
        """Test that customer orders includes rush order count"""
        customer_name = "TestDealerRushCount"
        
        # Create regular order
        order_data = {
            "order_number": "TEST-S6-RUSHC-001",
            "customer_name": customer_name,
            "product_type": "rim",
            "wheel_specs": "22x10"
        }
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        order_id = create_res.json()["id"]
        
        # Mark as RUSH
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/rush", json={
            "is_rush": True,
            "rush_reason": "Test rush"
        })
        
        # Get customer orders
        orders_res = self.session.get(f"{BASE_URL}/api/customers/{customer_name}/orders")
        assert orders_res.status_code == 200
        
        data = orders_res.json()
        assert "rush_orders" in data
        assert data["rush_orders"] >= 1, f"Expected at least 1 rush order, got {data['rush_orders']}"
        print(f"✓ Customer orders includes rush count: {data['rush_orders']}")


class TestHealthCheck:
    """Basic health check test"""
    
    def test_health_endpoint(self):
        """Test health endpoint is accessible"""
        res = requests.get(f"{BASE_URL}/api/health")
        assert res.status_code == 200
        print(f"✓ Health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
