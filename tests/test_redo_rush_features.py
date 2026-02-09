"""
Test Suite for Re-Do Orders and RUSH Queue Sorting Features
Tests:
1. RUSH queue sorting by order_number (ascending)
2. Re-Do queue page at /redo-queue
3. Mark order as Re-Do from order detail view
4. Re-Do badge in dashboard header with count
5. Move Re-Do order to any department
6. RUSH override Re-Do (order is both - appears only in RUSH queue)
7. Remove Re-Do status
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRedoRushFeatures:
    """Test Re-Do Orders and RUSH Queue Sorting Features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "digitalebookdepot@gmail.com",
            "password": "Admin123!"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.user = login_response.json().get("user")
        
        yield
        
        # Cleanup: Delete test orders created during tests
        self._cleanup_test_orders()
    
    def _cleanup_test_orders(self):
        """Clean up test orders created during testing"""
        try:
            # Search for test orders
            search_res = self.session.get(f"{BASE_URL}/api/orders/search?q=TEST-REDO")
            if search_res.status_code == 200:
                for order in search_res.data if hasattr(search_res, 'data') else search_res.json():
                    if order.get("order_number", "").startswith("TEST-REDO"):
                        self.session.delete(f"{BASE_URL}/api/orders/{order['id']}")
        except:
            pass
    
    # ============ HEALTH CHECK ============
    def test_health_check(self):
        """Test API health endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health check passed")
    
    # ============ RUSH QUEUE SORTING TESTS ============
    def test_rush_queue_sorting_by_order_number(self):
        """Test that RUSH queue returns orders sorted by order_number ascending"""
        # Create multiple test orders with different order numbers
        test_orders = []
        order_numbers = ["TEST-REDO-003", "TEST-REDO-001", "TEST-REDO-002"]
        
        for order_num in order_numbers:
            create_res = self.session.post(f"{BASE_URL}/api/orders", json={
                "order_number": order_num,
                "customer_name": "Test Customer",
                "product_type": "rim",
                "wheel_specs": "22x10"
            })
            assert create_res.status_code == 200, f"Failed to create order: {create_res.text}"
            test_orders.append(create_res.json())
        
        # Mark all as RUSH
        for order in test_orders:
            rush_res = self.session.put(f"{BASE_URL}/api/orders/{order['id']}/rush", json={
                "is_rush": True,
                "rush_reason": "Testing sorting"
            })
            assert rush_res.status_code == 200, f"Failed to mark as RUSH: {rush_res.text}"
        
        # Get RUSH queue
        rush_queue_res = self.session.get(f"{BASE_URL}/api/rush-queue")
        assert rush_queue_res.status_code == 200
        rush_orders = rush_queue_res.json()
        
        # Filter to only our test orders
        test_rush_orders = [o for o in rush_orders if o.get("order_number", "").startswith("TEST-REDO")]
        
        # Verify sorting - should be ascending by order_number
        order_nums = [o["order_number"] for o in test_rush_orders]
        assert order_nums == sorted(order_nums), f"RUSH queue not sorted correctly: {order_nums}"
        print(f"✓ RUSH queue sorted correctly: {order_nums}")
        
        # Cleanup
        for order in test_orders:
            self.session.delete(f"{BASE_URL}/api/orders/{order['id']}")
    
    # ============ RE-DO QUEUE TESTS ============
    def test_mark_order_as_redo(self):
        """Test marking an order as Re-Do"""
        # Create a test order
        create_res = self.session.post(f"{BASE_URL}/api/orders", json={
            "order_number": "TEST-REDO-MARK-001",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10"
        })
        assert create_res.status_code == 200
        order = create_res.json()
        order_id = order["id"]
        
        # Mark as Re-Do
        redo_res = self.session.put(f"{BASE_URL}/api/orders/{order_id}/redo", json={
            "is_redo": True,
            "redo_reason": "Customer complaint - wrong finish"
        })
        assert redo_res.status_code == 200
        updated_order = redo_res.json()
        
        # Verify Re-Do fields
        assert updated_order.get("is_redo") == True
        assert updated_order.get("redo_reason") == "Customer complaint - wrong finish"
        assert updated_order.get("redo_set_by") is not None
        assert updated_order.get("redo_set_at") is not None
        print("✓ Order marked as Re-Do successfully")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
    
    def test_redo_queue_endpoint(self):
        """Test GET /api/redo-queue returns Re-Do orders"""
        # Create and mark an order as Re-Do
        create_res = self.session.post(f"{BASE_URL}/api/orders", json={
            "order_number": "TEST-REDO-QUEUE-001",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10"
        })
        assert create_res.status_code == 200
        order = create_res.json()
        order_id = order["id"]
        
        # Mark as Re-Do
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/redo", json={
            "is_redo": True,
            "redo_reason": "Testing redo queue"
        })
        
        # Get Re-Do queue
        redo_queue_res = self.session.get(f"{BASE_URL}/api/redo-queue")
        assert redo_queue_res.status_code == 200
        redo_orders = redo_queue_res.json()
        
        # Verify our test order is in the queue
        test_order_in_queue = any(o.get("order_number") == "TEST-REDO-QUEUE-001" for o in redo_orders)
        assert test_order_in_queue, "Test order not found in Re-Do queue"
        print("✓ Re-Do queue endpoint returns Re-Do orders")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
    
    def test_redo_queue_stats_endpoint(self):
        """Test GET /api/redo-queue/stats returns statistics"""
        redo_stats_res = self.session.get(f"{BASE_URL}/api/redo-queue/stats")
        assert redo_stats_res.status_code == 200
        stats = redo_stats_res.json()
        
        # Verify stats structure
        assert "total" in stats
        assert "by_department" in stats
        assert "refinish_overlap" in stats
        assert isinstance(stats["total"], int)
        assert isinstance(stats["by_department"], dict)
        print(f"✓ Re-Do queue stats: total={stats['total']}, by_department={stats['by_department']}")
    
    def test_move_redo_order_to_any_department(self):
        """Test moving Re-Do order to any department (skip steps)"""
        # Create and mark an order as Re-Do
        create_res = self.session.post(f"{BASE_URL}/api/orders", json={
            "order_number": "TEST-REDO-MOVE-001",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10"
        })
        assert create_res.status_code == 200
        order = create_res.json()
        order_id = order["id"]
        
        # Mark as Re-Do
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/redo", json={
            "is_redo": True,
            "redo_reason": "Testing move feature"
        })
        
        # Move to machine department (skipping design, program, machine_waiting)
        move_res = self.session.put(f"{BASE_URL}/api/redo-queue/{order_id}/move-to", json={
            "target_department": "machine"
        })
        assert move_res.status_code == 200
        moved_order = move_res.json()
        
        # Verify order moved
        assert moved_order.get("current_department") == "machine"
        assert moved_order.get("last_moved_to") == "machine"
        print("✓ Re-Do order moved to machine department (skipped steps)")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
    
    def test_move_redo_order_to_completed(self):
        """Test moving Re-Do order directly to completed clears Re-Do flag"""
        # Create and mark an order as Re-Do
        create_res = self.session.post(f"{BASE_URL}/api/orders", json={
            "order_number": "TEST-REDO-COMPLETE-001",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10"
        })
        assert create_res.status_code == 200
        order = create_res.json()
        order_id = order["id"]
        
        # Mark as Re-Do
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/redo", json={
            "is_redo": True,
            "redo_reason": "Testing completion"
        })
        
        # Move to completed
        move_res = self.session.put(f"{BASE_URL}/api/redo-queue/{order_id}/move-to", json={
            "target_department": "completed"
        })
        assert move_res.status_code == 200
        completed_order = move_res.json()
        
        # Verify Re-Do flag is cleared when completed
        assert completed_order.get("current_department") == "completed"
        assert completed_order.get("is_redo") == False, "Re-Do flag should be cleared when completed"
        assert completed_order.get("redo_reason") is None
        print("✓ Re-Do order moved to completed and Re-Do flag cleared")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
    
    def test_remove_redo_status(self):
        """Test removing Re-Do status from an order"""
        # Create and mark an order as Re-Do
        create_res = self.session.post(f"{BASE_URL}/api/orders", json={
            "order_number": "TEST-REDO-REMOVE-001",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10"
        })
        assert create_res.status_code == 200
        order = create_res.json()
        order_id = order["id"]
        
        # Mark as Re-Do
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/redo", json={
            "is_redo": True,
            "redo_reason": "Testing removal"
        })
        
        # Remove Re-Do status
        remove_res = self.session.put(f"{BASE_URL}/api/orders/{order_id}/redo", json={
            "is_redo": False
        })
        assert remove_res.status_code == 200
        updated_order = remove_res.json()
        
        # Verify Re-Do status removed
        assert updated_order.get("is_redo") == False
        assert updated_order.get("redo_reason") is None
        assert updated_order.get("redo_set_by") is None
        assert updated_order.get("redo_set_at") is None
        print("✓ Re-Do status removed successfully")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
    
    # ============ RUSH OVERRIDE RE-DO TESTS ============
    def test_rush_overrides_redo_in_queue(self):
        """Test that RUSH orders override Re-Do - order appears only in RUSH queue"""
        # Create an order
        create_res = self.session.post(f"{BASE_URL}/api/orders", json={
            "order_number": "TEST-REDO-OVERRIDE-001",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10"
        })
        assert create_res.status_code == 200
        order = create_res.json()
        order_id = order["id"]
        
        # Mark as Re-Do first
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/redo", json={
            "is_redo": True,
            "redo_reason": "Customer issue"
        })
        
        # Verify it's in Re-Do queue
        redo_queue_res = self.session.get(f"{BASE_URL}/api/redo-queue")
        redo_orders = redo_queue_res.json()
        in_redo_queue = any(o.get("id") == order_id for o in redo_orders)
        assert in_redo_queue, "Order should be in Re-Do queue before marking as RUSH"
        
        # Now mark as RUSH
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/rush", json={
            "is_rush": True,
            "rush_reason": "Urgent"
        })
        
        # Verify it's in RUSH queue
        rush_queue_res = self.session.get(f"{BASE_URL}/api/rush-queue")
        rush_orders = rush_queue_res.json()
        in_rush_queue = any(o.get("id") == order_id for o in rush_orders)
        assert in_rush_queue, "Order should be in RUSH queue"
        
        # Verify it's NOT in Re-Do queue anymore (RUSH overrides)
        redo_queue_res2 = self.session.get(f"{BASE_URL}/api/redo-queue")
        redo_orders2 = redo_queue_res2.json()
        in_redo_queue2 = any(o.get("id") == order_id for o in redo_orders2)
        assert not in_redo_queue2, "Order should NOT be in Re-Do queue when marked as RUSH"
        print("✓ RUSH overrides Re-Do - order appears only in RUSH queue")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
    
    def test_non_redo_order_rejected_from_move_endpoint(self):
        """Test that non-Re-Do orders are rejected from redo-queue move endpoint"""
        # Create a regular order (not Re-Do)
        create_res = self.session.post(f"{BASE_URL}/api/orders", json={
            "order_number": "TEST-REDO-REJECT-001",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10"
        })
        assert create_res.status_code == 200
        order = create_res.json()
        order_id = order["id"]
        
        # Try to move via redo-queue endpoint (should fail)
        move_res = self.session.put(f"{BASE_URL}/api/redo-queue/{order_id}/move-to", json={
            "target_department": "machine"
        })
        assert move_res.status_code == 400
        assert "Re-Do" in move_res.json().get("detail", "")
        print("✓ Non-Re-Do orders correctly rejected from redo-queue move endpoint")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
    
    def test_invalid_department_rejected(self):
        """Test that invalid department is rejected in move endpoint"""
        # Create and mark an order as Re-Do
        create_res = self.session.post(f"{BASE_URL}/api/orders", json={
            "order_number": "TEST-REDO-INVALID-001",
            "customer_name": "Test Customer",
            "product_type": "rim",
            "wheel_specs": "22x10"
        })
        assert create_res.status_code == 200
        order = create_res.json()
        order_id = order["id"]
        
        # Mark as Re-Do
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/redo", json={
            "is_redo": True,
            "redo_reason": "Testing"
        })
        
        # Try to move to invalid department
        move_res = self.session.put(f"{BASE_URL}/api/redo-queue/{order_id}/move-to", json={
            "target_department": "invalid_dept"
        })
        assert move_res.status_code == 400
        assert "Invalid department" in move_res.json().get("detail", "")
        print("✓ Invalid department correctly rejected")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
    
    def test_redo_queue_sorted_by_order_number(self):
        """Test that Re-Do queue returns orders sorted by order_number ascending"""
        # Create multiple test orders with different order numbers
        test_orders = []
        order_numbers = ["TEST-REDO-SORT-003", "TEST-REDO-SORT-001", "TEST-REDO-SORT-002"]
        
        for order_num in order_numbers:
            create_res = self.session.post(f"{BASE_URL}/api/orders", json={
                "order_number": order_num,
                "customer_name": "Test Customer",
                "product_type": "rim",
                "wheel_specs": "22x10"
            })
            assert create_res.status_code == 200
            test_orders.append(create_res.json())
        
        # Mark all as Re-Do
        for order in test_orders:
            self.session.put(f"{BASE_URL}/api/orders/{order['id']}/redo", json={
                "is_redo": True,
                "redo_reason": "Testing sorting"
            })
        
        # Get Re-Do queue
        redo_queue_res = self.session.get(f"{BASE_URL}/api/redo-queue")
        assert redo_queue_res.status_code == 200
        redo_orders = redo_queue_res.json()
        
        # Filter to only our test orders
        test_redo_orders = [o for o in redo_orders if o.get("order_number", "").startswith("TEST-REDO-SORT")]
        
        # Verify sorting - should be ascending by order_number
        order_nums = [o["order_number"] for o in test_redo_orders]
        assert order_nums == sorted(order_nums), f"Re-Do queue not sorted correctly: {order_nums}"
        print(f"✓ Re-Do queue sorted correctly: {order_nums}")
        
        # Cleanup
        for order in test_orders:
            self.session.delete(f"{BASE_URL}/api/orders/{order['id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
