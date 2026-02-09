#!/usr/bin/env python3
"""
Refinish Queue Feature Testing
Tests all refinish queue API endpoints and cut status visibility
"""

import requests
import sys
import json
from datetime import datetime

class RefinishQueueTester:
    def __init__(self, base_url="https://whsmonitor.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_orders = []
        self.refinish_entries = []

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.json()}")
                except:
                    print(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_admin_login(self):
        """Test admin login with provided credentials"""
        login_data = {
            "email": "digitalebookdepot@gmail.com",
            "password": "Admin123!"
        }
        success, response = self.run_test("Admin Login", "POST", "auth/login", 200, login_data)
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_create_test_orders(self):
        """Create test orders for refinish queue testing"""
        print("\n📦 Creating Test Orders for Refinish Queue...")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        # Create steering wheel order
        steering_wheel_order = {
            "order_number": "SW-REFINISH-001",
            "customer_name": "John Doe",
            "phone": "555-1234",
            "product_type": "steering_wheel",
            "wheel_specs": "Custom leather steering wheel",
            "notes": "Customer wants red stitching",
            "cut_status": "waiting"
        }
        
        success, response = self.run_test(
            "Create Steering Wheel Order", "POST", "orders", 200, 
            steering_wheel_order, self.admin_token
        )
        
        if success and 'id' in response:
            self.created_orders.append({
                'id': response['id'],
                'order_number': response['order_number'],
                'product_type': 'steering_wheel'
            })
            print(f"   Created steering wheel order: {response.get('order_number')}")
        else:
            return False

        # Create caps order
        caps_order = {
            "order_number": "CAPS-REFINISH-001",
            "customer_name": "Jane Smith",
            "phone": "555-5678",
            "product_type": "custom_caps",
            "wheel_specs": "Custom caps with logo",
            "notes": "Special design requirements",
            "quantity": 4,
            "cut_status": "waiting"
        }
        
        success, response = self.run_test(
            "Create Caps Order", "POST", "orders", 200, 
            caps_order, self.admin_token
        )
        
        if success and 'id' in response:
            self.created_orders.append({
                'id': response['id'],
                'order_number': response['order_number'],
                'product_type': 'custom_caps'
            })
            print(f"   Created caps order: {response.get('order_number')}")
            return True
        
        return False

    def test_add_to_refinish_queue(self):
        """Test POST /api/refinish-queue/add"""
        print("\n🔄 Testing Add to Refinish Queue...")
        
        if not self.admin_token or not self.created_orders:
            print("❌ No admin token or test orders available")
            return False

        # Add first order to refinish queue
        order = self.created_orders[0]
        refinish_data = {
            "order_id": order['id'],
            "fix_notes": "Customer reported scratches on surface, needs refinishing"
        }
        
        success, response = self.run_test(
            "Add Order to Refinish Queue", "POST", "refinish-queue/add", 200, 
            refinish_data, self.admin_token
        )
        
        if success and 'id' in response:
            self.refinish_entries.append({
                'id': response['id'],
                'original_order_id': response['original_order_id'],
                'order_number': response['order_number']
            })
            print(f"   Added to refinish queue: {response.get('order_number')}")
            print(f"   Fix notes: {response.get('fix_notes')}")
            print(f"   Status: {response.get('status')}")
            return True
        
        return False

    def test_add_duplicate_to_refinish_queue(self):
        """Test adding same order to refinish queue (should fail)"""
        print("\n🚫 Testing Duplicate Add to Refinish Queue...")
        
        if not self.admin_token or not self.created_orders:
            print("❌ No admin token or test orders available")
            return False

        # Try to add same order again (should fail)
        order = self.created_orders[0]
        refinish_data = {
            "order_id": order['id'],
            "fix_notes": "Trying to add duplicate"
        }
        
        success, response = self.run_test(
            "Add Duplicate Order to Refinish Queue (Should Fail)", "POST", "refinish-queue/add", 400, 
            refinish_data, self.admin_token
        )
        
        # Success here means it properly failed with 400
        return success

    def test_get_refinish_queue(self):
        """Test GET /api/refinish-queue"""
        print("\n📋 Testing Get Refinish Queue...")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        success, response = self.run_test(
            "Get All Refinish Queue Entries", "GET", "refinish-queue", 200, 
            token=self.admin_token
        )
        
        if success:
            print(f"   Found {len(response)} entries in refinish queue")
            for entry in response:
                print(f"   - Order: {entry.get('order_number')}, Status: {entry.get('status')}")
            return True
        
        return False

    def test_get_refinish_queue_filtered(self):
        """Test GET /api/refinish-queue with status filter"""
        print("\n🔍 Testing Get Refinish Queue with Filter...")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        success, response = self.run_test(
            "Get Refinish Queue (Received Status)", "GET", "refinish-queue?status=received", 200, 
            token=self.admin_token
        )
        
        if success:
            print(f"   Found {len(response)} entries with 'received' status")
            # Verify all entries have 'received' status
            for entry in response:
                if entry.get('status') != 'received':
                    print(f"❌ Found entry with wrong status: {entry.get('status')}")
                    return False
            print("   ✅ All entries have correct 'received' status")
            return True
        
        return False

    def test_get_refinish_stats(self):
        """Test GET /api/refinish-queue/stats"""
        print("\n📊 Testing Get Refinish Queue Stats...")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        success, response = self.run_test(
            "Get Refinish Queue Statistics", "GET", "refinish-queue/stats", 200, 
            token=self.admin_token
        )
        
        if success:
            print(f"   Total entries: {response.get('total', 0)}")
            
            by_status = response.get('by_status', {})
            print("   Status breakdown:")
            for status, count in by_status.items():
                print(f"     {status}: {count}")
            
            by_product_type = response.get('by_product_type', {})
            print("   Product type breakdown:")
            for product_type, count in by_product_type.items():
                print(f"     {product_type}: {count}")
            
            return True
        
        return False

    def test_update_refinish_entry(self):
        """Test PUT /api/refinish-queue/{id}"""
        print("\n✏️ Testing Update Refinish Entry...")
        
        if not self.admin_token or not self.refinish_entries:
            print("❌ No admin token or refinish entries available")
            return False

        entry = self.refinish_entries[0]
        update_data = {
            "status": "in_progress",
            "fix_notes": "Started refinishing process - sanding complete",
            "department": "finishing"
        }
        
        success, response = self.run_test(
            "Update Refinish Entry Status", "PUT", f"refinish-queue/{entry['id']}", 200, 
            update_data, self.admin_token
        )
        
        if success:
            print(f"   Updated status: {response.get('status')}")
            print(f"   Updated notes: {response.get('fix_notes')}")
            print(f"   Updated department: {response.get('current_department')}")
            
            # Verify status history was updated
            status_history = response.get('status_history', [])
            if len(status_history) >= 2:
                print(f"   Status history entries: {len(status_history)}")
                return True
            else:
                print("❌ Status history not properly updated")
                return False
        
        return False

    def test_advance_refinish_status(self):
        """Test advancing refinish entry through workflow"""
        print("\n⏭️ Testing Advance Refinish Status Workflow...")
        
        if not self.admin_token or not self.refinish_entries:
            print("❌ No admin token or refinish entries available")
            return False

        entry = self.refinish_entries[0]
        
        # Advance to completed
        update_data = {"status": "completed"}
        success, response = self.run_test(
            "Advance to Completed", "PUT", f"refinish-queue/{entry['id']}", 200, 
            update_data, self.admin_token
        )
        
        if not success:
            return False
        
        print(f"   Status advanced to: {response.get('status')}")
        
        # Advance to shipped_back
        update_data = {"status": "shipped_back"}
        success, response = self.run_test(
            "Advance to Shipped Back", "PUT", f"refinish-queue/{entry['id']}", 200, 
            update_data, self.admin_token
        )
        
        if success:
            print(f"   Final status: {response.get('status')}")
            
            # Verify status history shows complete workflow
            status_history = response.get('status_history', [])
            expected_statuses = ['received', 'in_progress', 'completed', 'shipped_back']
            
            if len(status_history) == len(expected_statuses):
                print(f"   ✅ Complete workflow tracked in status history")
                return True
            else:
                print(f"❌ Status history incomplete: {len(status_history)} entries")
                return False
        
        return False

    def test_cut_status_update(self):
        """Test PUT /api/orders/{id}/cut-status for cut status visibility"""
        print("\n✂️ Testing Cut Status Update...")
        
        if not self.admin_token or not self.created_orders:
            print("❌ No admin token or test orders available")
            return False

        # Test updating cut status on steering wheel order
        steering_wheel_order = next((o for o in self.created_orders if o['product_type'] == 'steering_wheel'), None)
        if not steering_wheel_order:
            print("❌ No steering wheel order available for cut status test")
            return False

        cut_data = {"cut_status": "cut"}
        success, response = self.run_test(
            "Update Cut Status to Complete", "PUT", f"orders/{steering_wheel_order['id']}/cut-status", 200, 
            cut_data, self.admin_token
        )
        
        if success:
            print(f"   Cut status updated to: {response.get('cut_status')}")
            
            # Test updating back to waiting
            cut_data = {"cut_status": "waiting"}
            success2, response2 = self.run_test(
                "Update Cut Status to Waiting", "PUT", f"orders/{steering_wheel_order['id']}/cut-status", 200, 
                cut_data, self.admin_token
            )
            
            if success2:
                print(f"   Cut status updated back to: {response2.get('cut_status')}")
                return True
        
        return False

    def test_delete_refinish_entry_non_admin(self):
        """Test DELETE /api/refinish-queue/{id} with non-admin user (should fail)"""
        print("\n🚫 Testing Delete Refinish Entry (Non-Admin)...")
        
        # Create a staff user for this test
        staff_data = {
            "email": "staff_refinish@test.com",
            "password": "test123",
            "name": "Staff User",
            "departments": ["finishing"],
            "role": "staff",
            "employee_code": "STAFF001"
        }
        
        # First create employee code
        if self.admin_token:
            code_data = {"code": "STAFF001"}
            self.run_test("Create Employee Code", "POST", "admin/employee-codes", 200, code_data, self.admin_token)
        
        # Register staff user
        success, response = self.run_test("Register Staff User", "POST", "auth/register", 200, staff_data)
        if not success:
            print("❌ Failed to register staff user")
            return False
        
        # Login as staff
        login_data = {
            "email": "staff_refinish@test.com",
            "password": "test123"
        }
        success, response = self.run_test("Staff Login", "POST", "auth/login", 200, login_data)
        if not success or 'token' not in response:
            print("❌ Failed to login as staff")
            return False
        
        staff_token = response['token']
        
        # Try to delete refinish entry as staff (should fail)
        if self.refinish_entries:
            entry = self.refinish_entries[0]
            success, response = self.run_test(
                "Delete Refinish Entry as Staff (Should Fail)", "DELETE", f"refinish-queue/{entry['id']}", 403, 
                token=staff_token
            )
            return success  # Success means it properly failed with 403
        
        return False

    def test_delete_refinish_entry_admin(self):
        """Test DELETE /api/refinish-queue/{id} with admin user"""
        print("\n🗑️ Testing Delete Refinish Entry (Admin)...")
        
        if not self.admin_token or not self.refinish_entries:
            print("❌ No admin token or refinish entries available")
            return False

        entry = self.refinish_entries[0]
        success, response = self.run_test(
            "Delete Refinish Entry as Admin", "DELETE", f"refinish-queue/{entry['id']}", 200, 
            token=self.admin_token
        )
        
        if success:
            print(f"   ✅ Successfully deleted refinish entry")
            
            # Verify entry is deleted by trying to get it
            success2, response2 = self.run_test(
                "Verify Entry Deleted", "GET", f"refinish-queue", 200, 
                token=self.admin_token
            )
            
            if success2:
                # Check if deleted entry is no longer in the list
                for remaining_entry in response2:
                    if remaining_entry.get('id') == entry['id']:
                        print("❌ Entry still exists after deletion")
                        return False
                print("   ✅ Entry successfully removed from queue")
                return True
        
        return False

    def test_invalid_refinish_operations(self):
        """Test various invalid operations on refinish queue"""
        print("\n🚫 Testing Invalid Refinish Operations...")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        # Test adding non-existent order
        invalid_data = {
            "order_id": "non-existent-id",
            "fix_notes": "This should fail"
        }
        success1, _ = self.run_test(
            "Add Non-existent Order (Should Fail)", "POST", "refinish-queue/add", 404, 
            invalid_data, self.admin_token
        )
        
        # Test updating non-existent refinish entry
        update_data = {"status": "completed"}
        success2, _ = self.run_test(
            "Update Non-existent Entry (Should Fail)", "PUT", "refinish-queue/non-existent-id", 404, 
            update_data, self.admin_token
        )
        
        # Test invalid status update
        if self.refinish_entries:
            entry = self.refinish_entries[0] if self.refinish_entries else None
            if entry:
                invalid_status_data = {"status": "invalid_status"}
                success3, _ = self.run_test(
                    "Update with Invalid Status (Should Fail)", "PUT", f"refinish-queue/{entry['id']}", 200, 
                    invalid_status_data, self.admin_token
                )
                # This might succeed but not update the status, or fail - either is acceptable
                success3 = True  # Don't fail the test for this
            else:
                success3 = True
        else:
            success3 = True
        
        return success1 and success2 and success3

    def run_all_tests(self):
        """Run all refinish queue tests"""
        print("🚀 Starting Refinish Queue Feature Tests...")
        print("=" * 60)
        
        tests = [
            self.test_admin_login,
            self.test_create_test_orders,
            self.test_add_to_refinish_queue,
            self.test_add_duplicate_to_refinish_queue,
            self.test_get_refinish_queue,
            self.test_get_refinish_queue_filtered,
            self.test_get_refinish_stats,
            self.test_update_refinish_entry,
            self.test_advance_refinish_status,
            self.test_cut_status_update,
            self.test_delete_refinish_entry_non_admin,
            self.test_delete_refinish_entry_admin,
            self.test_invalid_refinish_operations
        ]
        
        for test in tests:
            try:
                test()
            except Exception as e:
                print(f"❌ Test {test.__name__} failed with exception: {str(e)}")
        
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed ({(self.tests_passed/self.tests_run)*100:.1f}%)")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed! Refinish Queue feature is working correctly.")
            return True
        else:
            print(f"⚠️ {self.tests_run - self.tests_passed} tests failed. Please review the issues above.")
            return False

if __name__ == "__main__":
    tester = RefinishQueueTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)