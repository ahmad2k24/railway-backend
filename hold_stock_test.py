#!/usr/bin/env python3
"""
Corleone Forged Order Tracker - Hold Queue and Stock Sets Testing
Tests the new Hold Queue and Stock Sets features
"""

import requests
import sys
import json
from datetime import datetime

class HoldStockAPITester:
    def __init__(self, base_url="https://whsmonitor.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.hold_test_order_id = None
        self.test_stock_id = None
        self.stock_order_id = None

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

    def test_login_with_provided_credentials(self):
        """Test login with provided admin credentials"""
        login_data = {
            "email": "digitalebookdepot@gmail.com",
            "password": "Admin123!"
        }
        success, response = self.run_test("Login with Provided Credentials", "POST", "auth/login", 200, login_data)
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_hold_queue_get(self):
        """Test GET /api/hold-queue - Should return orders on hold"""
        print("\n🔒 Testing Hold Queue - Get Orders on Hold...")
        
        if not self.admin_token:
            print("❌ No admin token available for hold queue test")
            return False

        success, response = self.run_test(
            "Get Hold Queue", "GET", "hold-queue", 200, token=self.admin_token
        )
        
        if success:
            print(f"✅ Hold queue endpoint working - found {len(response)} orders on hold")
            for order in response:
                print(f"   Order: {order.get('order_number')} - {order.get('customer_name')} - Reason: {order.get('hold_reason', 'No reason')}")
                print(f"   Days on hold: {order.get('days_on_hold', 0)}")
            return True
        else:
            print("❌ Hold queue endpoint failed")
            return False

    def test_hold_queue_add(self):
        """Test POST /api/hold-queue/add - Add an order to hold"""
        print("\n➕ Testing Hold Queue - Add Order to Hold...")
        
        if not self.admin_token:
            print("❌ No admin token available for hold queue add test")
            return False

        # First create a test order to add to hold
        order_data = {
            "order_number": "HOLD-TEST-001",
            "customer_name": "Hold Test Customer",
            "phone": "555-HOLD",
            "product_type": "rim",
            "wheel_specs": "22x10 Test Rims",
            "notes": "Order for hold queue testing"
        }
        
        success, response = self.run_test(
            "Create Order for Hold Test", "POST", "orders", 200,
            order_data, self.admin_token
        )
        
        if not success or 'id' not in response:
            print("❌ Failed to create order for hold test")
            return False
        
        order_id = response['id']
        print(f"   Created test order: {response.get('order_number')}")
        
        # Add order to hold queue
        hold_data = {
            "order_id": order_id,
            "hold_reason": "Waiting on Payment"
        }
        
        success, hold_response = self.run_test(
            "Add Order to Hold Queue", "POST", "hold-queue/add", 200,
            hold_data, self.admin_token
        )
        
        if success:
            print("✅ Successfully added order to hold queue")
            self.hold_test_order_id = order_id  # Store for other tests
            return True
        else:
            print("❌ Failed to add order to hold queue")
            return False

    def test_hold_queue_verify_added(self):
        """Verify the order appears in hold queue"""
        print("\n🔍 Testing Hold Queue - Verify Order Added...")
        
        if not self.admin_token:
            print("❌ No admin token available for hold queue verification")
            return False

        success, response = self.run_test(
            "Get Hold Queue for Verification", "GET", "hold-queue", 200, token=self.admin_token
        )
        
        if success:
            # Find our test order
            found_order = False
            for order in response:
                if order.get('id') == self.hold_test_order_id:
                    found_order = True
                    print(f"   ✅ Found order in hold queue: {order.get('order_number')}")
                    print(f"   Hold reason: {order.get('hold_reason')}")
                    break
            
            if found_order:
                print("✅ Order successfully appears in hold queue")
                return True
            else:
                print("❌ Order not found in hold queue")
                return False
        else:
            print("❌ Failed to get hold queue for verification")
            return False

    def test_hold_queue_update_reason(self):
        """Test PUT /api/hold-queue/{order_id}/reason - Update hold reason"""
        print("\n✏️ Testing Hold Queue - Update Hold Reason...")
        
        if not self.admin_token:
            print("❌ No admin token available for hold reason update test")
            return False

        if not self.hold_test_order_id:
            print("❌ No test order on hold available")
            return False

        # Update hold reason
        update_data = {
            "order_id": self.hold_test_order_id,
            "hold_reason": "Ready to Resell"
        }
        
        success, response = self.run_test(
            "Update Hold Reason", "PUT", f"hold-queue/{self.hold_test_order_id}/reason", 200,
            update_data, self.admin_token
        )
        
        if success:
            print("✅ Successfully updated hold reason")
            return True
        else:
            print("❌ Failed to update hold reason")
            return False

    def test_hold_queue_remove(self):
        """Test POST /api/hold-queue/remove - Remove order from hold"""
        print("\n➖ Testing Hold Queue - Remove Order from Hold...")
        
        if not self.admin_token:
            print("❌ No admin token available for hold queue remove test")
            return False

        if not self.hold_test_order_id:
            print("❌ No test order on hold available")
            return False

        # Remove order from hold queue
        remove_data = {
            "order_id": self.hold_test_order_id
        }
        
        success, response = self.run_test(
            "Remove Order from Hold Queue", "POST", "hold-queue/remove", 200,
            remove_data, self.admin_token
        )
        
        if success:
            print("✅ Successfully removed order from hold queue")
            return True
        else:
            print("❌ Failed to remove order from hold queue")
            return False

    def test_hold_queue_verify_removed(self):
        """Verify the order is removed from hold queue"""
        print("\n🔍 Testing Hold Queue - Verify Order Removed...")
        
        if not self.admin_token:
            print("❌ No admin token available for hold queue verification")
            return False

        success, response = self.run_test(
            "Get Hold Queue for Removal Verification", "GET", "hold-queue", 200, token=self.admin_token
        )
        
        if success:
            # Make sure our test order is NOT in the hold queue
            found_order = False
            for order in response:
                if order.get('id') == self.hold_test_order_id:
                    found_order = True
                    break
            
            if not found_order:
                print("✅ Order successfully removed from hold queue")
                return True
            else:
                print("❌ Order still found in hold queue after removal")
                return False
        else:
            print("❌ Failed to get hold queue for removal verification")
            return False

    def test_stock_inventory_get(self):
        """Test GET /api/stock-inventory - Should return 38 pre-imported stock sets"""
        print("\n📦 Testing Stock Inventory - Get Stock Sets...")
        
        if not self.admin_token:
            print("❌ No admin token available for stock inventory test")
            return False

        success, response = self.run_test(
            "Get Stock Inventory", "GET", "stock-inventory", 200, token=self.admin_token
        )
        
        if success:
            print(f"✅ Stock inventory endpoint working - found {len(response)} stock sets")
            
            # Check for expected 38 stock sets
            if len(response) >= 38:
                print(f"   ✅ Found expected number of stock sets (38+): {len(response)}")
            else:
                print(f"   ⚠️ Expected 38 stock sets, found {len(response)}")
            
            # Show sample stock sets and count by status
            available_count = 0
            sold_count = 0
            for stock in response:
                status = stock.get('status', 'unknown')
                if status == 'available':
                    available_count += 1
                elif status == 'sold':
                    sold_count += 1
            
            print(f"   Available: {available_count}, Sold: {sold_count}")
            
            # Show sample stock sets
            for i, stock in enumerate(response[:3]):
                print(f"   Stock {i+1}: SKU {stock.get('sku', 'N/A')} - {stock.get('name', 'N/A')} - Status: {stock.get('status', 'N/A')}")
            
            return True
        else:
            print("❌ Stock inventory endpoint failed")
            return False

    def test_stock_inventory_create(self):
        """Test POST /api/stock-inventory - Create a new stock set"""
        print("\n➕ Testing Stock Inventory - Create Stock Set...")
        
        if not self.admin_token:
            print("❌ No admin token available for stock inventory create test")
            return False

        # Create new stock set
        stock_data = {
            "sku": "TEST-001",
            "name": "Test Stock Set",
            "size": "22x10",
            "bolt_pattern": "5x120",
            "cf_caps": "Yes",
            "finish": "Gloss Black",
            "original_order_number": "8614",
            "fitment": "BMW X5",
            "cubby_number": "A1",
            "notes": "Test stock set for API testing"
        }
        
        success, response = self.run_test(
            "Create Stock Set", "POST", "stock-inventory", 200,
            stock_data, self.admin_token
        )
        
        if success and 'id' in response:
            self.test_stock_id = response['id']
            print(f"   Created stock set: SKU {response.get('sku')} - {response.get('name')}")
            print(f"   Status: {response.get('status')}")
            return True
        else:
            print("❌ Failed to create stock set")
            return False

    def test_stock_inventory_update(self):
        """Test PUT /api/stock-inventory/{id} - Update a stock set"""
        print("\n✏️ Testing Stock Inventory - Update Stock Set...")
        
        if not self.admin_token:
            print("❌ No admin token available for stock inventory update test")
            return False

        if not self.test_stock_id:
            print("❌ No test stock set available for update")
            return False

        # Update stock set
        update_data = {
            "cubby_number": "99",
            "notes": "Updated test stock set"
        }
        
        success, response = self.run_test(
            "Update Stock Set", "PUT", f"stock-inventory/{self.test_stock_id}", 200,
            update_data, self.admin_token
        )
        
        if success:
            print(f"   Updated cubby number to: {response.get('cubby_number')}")
            print(f"   Updated notes: {response.get('notes')}")
            return True
        else:
            print("❌ Failed to update stock set")
            return False

    def test_stock_inventory_create_order(self):
        """Test POST /api/stock-inventory/{id}/create-order - Create order from stock"""
        print("\n🛒 Testing Stock Inventory - Create Order from Stock...")
        
        if not self.admin_token:
            print("❌ No admin token available for stock order creation test")
            return False

        if not self.test_stock_id:
            print("❌ No test stock set available for order creation")
            return False

        # Create order from stock
        order_data = {
            "customer_name": "Stock Order Customer",
            "phone": "555-STOCK",
            "notes": "Order created from stock set"
        }
        
        success, response = self.run_test(
            "Create Order from Stock", "POST", f"stock-inventory/{self.test_stock_id}/create-order", 200,
            order_data, self.admin_token
        )
        
        if success:
            order = response.get('order', {})
            print(f"   Created order: #{order.get('order_number')} for {order.get('customer_name')}")
            print(f"   Order specs: {order.get('wheel_specs')}")
            self.stock_order_id = order.get('id')
            return True
        else:
            print("❌ Failed to create order from stock")
            return False

    def test_stock_inventory_verify_sold(self):
        """Verify the stock set status is now 'sold'"""
        print("\n✅ Testing Stock Inventory - Verify Stock Set Sold...")
        
        if not self.admin_token:
            print("❌ No admin token available for stock verification test")
            return False

        if not self.test_stock_id:
            print("❌ No test stock set available for verification")
            return False

        # Get stock inventory to verify status
        success, response = self.run_test(
            "Get Stock Inventory for Verification", "GET", "stock-inventory", 200, token=self.admin_token
        )
        
        if success:
            # Find our test stock set
            test_stock = None
            for stock in response:
                if stock.get('id') == self.test_stock_id:
                    test_stock = stock
                    break
            
            if test_stock:
                status = test_stock.get('status')
                print(f"   Test stock set status: {status}")
                if status == 'sold':
                    print("✅ Stock set correctly marked as sold")
                    return True
                else:
                    print(f"❌ Stock set status should be 'sold', got '{status}'")
                    return False
            else:
                print("❌ Test stock set not found in inventory")
                return False
        else:
            print("❌ Failed to get stock inventory for verification")
            return False

    def test_stock_inventory_delete(self):
        """Test DELETE /api/stock-inventory/{id} - Delete a stock set"""
        print("\n🗑️ Testing Stock Inventory - Delete Stock Set...")
        
        if not self.admin_token:
            print("❌ No admin token available for stock inventory delete test")
            return False

        # First create another stock set to delete
        stock_data = {
            "sku": "DELETE-TEST-001",
            "name": "Delete Test Stock Set",
            "size": "20x8",
            "bolt_pattern": "5x114.3",
            "finish": "Chrome",
            "notes": "Stock set for delete testing"
        }
        
        success, response = self.run_test(
            "Create Stock Set for Delete Test", "POST", "stock-inventory", 200,
            stock_data, self.admin_token
        )
        
        if not success or 'id' not in response:
            print("❌ Failed to create stock set for delete test")
            return False
        
        delete_stock_id = response['id']
        print(f"   Created stock set for deletion: SKU {response.get('sku')}")
        
        # Delete the stock set
        success, delete_response = self.run_test(
            "Delete Stock Set", "DELETE", f"stock-inventory/{delete_stock_id}", 200,
            token=self.admin_token
        )
        
        if success:
            print("✅ Successfully deleted stock set")
            return True
        else:
            print("❌ Failed to delete stock set")
            return False

    def test_access_control_non_admin(self):
        """Test that non-Sales/non-Admin users cannot access these endpoints"""
        print("\n🚫 Testing Access Control - Non-Admin User...")
        
        # First register a non-admin user (design department)
        user_data = {
            "email": "design_user@test.com",
            "password": "test123",
            "name": "Design User",
            "departments": ["design"],
            "role": "staff",
            "employee_code": "DESIGN001"
        }
        
        # Create employee code first
        if self.admin_token:
            code_data = {"code": "DESIGN001"}
            self.run_test("Create Employee Code", "POST", "admin/employee-codes", 200, code_data, self.admin_token)
        
        success, response = self.run_test("Register Design User", "POST", "auth/register", 200, user_data)
        if not success:
            print("❌ Failed to register design user")
            return False
        
        # Login as design user
        login_data = {
            "email": "design_user@test.com",
            "password": "test123"
        }
        success, response = self.run_test("Design User Login", "POST", "auth/login", 200, login_data)
        if not success or 'token' not in response:
            print("❌ Failed to login as design user")
            return False
        
        design_token = response['token']
        print(f"   Design user token obtained: {design_token[:20]}...")
        
        # Test access to hold queue (should get 403)
        success, response = self.run_test(
            "Design User Access Hold Queue (Should Fail)", "GET", "hold-queue", 403,
            token=design_token
        )
        
        if success:  # Success means it properly returned 403
            print("✅ Hold queue properly restricted to Sales/Admin")
        else:
            print("❌ Hold queue access control failed")
            return False
        
        # Test access to stock inventory (should get 403)
        success, response = self.run_test(
            "Design User Access Stock Inventory (Should Fail)", "GET", "stock-inventory", 403,
            token=design_token
        )
        
        if success:  # Success means it properly returned 403
            print("✅ Stock inventory properly restricted to Sales/Admin")
            return True
        else:
            print("❌ Stock inventory access control failed")
            return False

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Hold Queue and Stock Sets API Tests...")
        print(f"   Base URL: {self.base_url}")
        print(f"   API URL: {self.api_url}")
        
        # Test sequence
        tests = [
            # Authentication with provided credentials
            ("Login with Provided Credentials", self.test_login_with_provided_credentials),
            
            # Hold Queue Feature Tests
            ("Hold Queue - Get Orders", self.test_hold_queue_get),
            ("Hold Queue - Add Order", self.test_hold_queue_add),
            ("Hold Queue - Verify Added", self.test_hold_queue_verify_added),
            ("Hold Queue - Update Reason", self.test_hold_queue_update_reason),
            ("Hold Queue - Remove Order", self.test_hold_queue_remove),
            ("Hold Queue - Verify Removed", self.test_hold_queue_verify_removed),
            
            # Stock Sets Feature Tests
            ("Stock Inventory - Get Stock Sets", self.test_stock_inventory_get),
            ("Stock Inventory - Create Stock Set", self.test_stock_inventory_create),
            ("Stock Inventory - Update Stock Set", self.test_stock_inventory_update),
            ("Stock Inventory - Create Order from Stock", self.test_stock_inventory_create_order),
            ("Stock Inventory - Verify Stock Sold", self.test_stock_inventory_verify_sold),
            ("Stock Inventory - Delete Stock Set", self.test_stock_inventory_delete),
            
            # Access Control Tests
            ("Access Control - Non-Admin User", self.test_access_control_non_admin),
        ]
        
        failed_tests = []
        
        for test_name, test_func in tests:
            try:
                success = test_func()
                if not success:
                    failed_tests.append(test_name)
            except Exception as e:
                print(f"❌ {test_name} - Exception: {str(e)}")
                failed_tests.append(test_name)
        
        # Print summary
        print(f"\n{'='*60}")
        print(f"📊 TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if failed_tests:
            print(f"\n❌ Failed Tests:")
            for test in failed_tests:
                print(f"   - {test}")
        else:
            print(f"\n✅ All tests passed!")
        
        return len(failed_tests) == 0

if __name__ == "__main__":
    tester = HoldStockAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)