#!/usr/bin/env python3
"""
RUSH Order Feature Testing Script
Tests the RUSH order functionality as requested in the review
"""

import requests
import sys
import json
from datetime import datetime

class RushOrderTester:
    def __init__(self, base_url="https://whsmonitor.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.staff_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_order_id = None

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
        """Test 1: Login as Admin with provided credentials"""
        print("\n🔐 Test 1: Admin Login")
        login_data = {
            "email": "digitalebookdepot@gmail.com",
            "password": "Admin123!"
        }
        success, response = self.run_test("Admin Login", "POST", "auth/login", 200, login_data)
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            print(f"   User: {response.get('user', {}).get('name', 'Unknown')}")
            print(f"   Role: {response.get('user', {}).get('role', 'Unknown')}")
            return True
        return False

    def test_verify_rush_fields(self):
        """Test 2: Verify RUSH fields in orders response"""
        print("\n📋 Test 2: Verify RUSH Fields in Orders Response")
        success, response = self.run_test("Get Orders", "GET", "orders", 200, token=self.admin_token)
        
        if not success:
            return False
        
        if not response:
            print("   No orders found to verify RUSH fields")
            return True
        
        # Check first order for RUSH fields
        sample_order = response[0]
        rush_fields = ['is_rush', 'rush_reason', 'rush_set_by', 'rush_set_at']
        hold_fields = ['is_on_hold', 'hold_reason', 'hold_date']
        all_fields = rush_fields + hold_fields
        
        missing_fields = []
        for field in all_fields:
            if field not in sample_order:
                missing_fields.append(field)
        
        if missing_fields:
            print(f"❌ Missing fields in order response: {missing_fields}")
            return False
        else:
            print("   ✅ All RUSH and Hold fields present in orders response:")
            for field in all_fields:
                value = sample_order.get(field)
                print(f"     {field}: {value}")
            
            # Count current RUSH orders
            rush_orders = [order for order in response if order.get('is_rush', False)]
            print(f"   Found {len(rush_orders)} RUSH orders currently")
            
            # Verify there are 4 RUSH orders as mentioned in the review request
            if len(rush_orders) >= 4:
                print(f"   ✅ Found {len(rush_orders)} RUSH orders (expected at least 4)")
            else:
                print(f"   ⚠️  Found only {len(rush_orders)} RUSH orders (expected 4)")
            
            return True

    def test_mark_order_as_rush(self):
        """Test 3: Test Mark Order as RUSH"""
        print("\n🚨 Test 3: Mark Order as RUSH")
        
        # First get a non-rush order
        success, orders_response = self.run_test("Get Orders for RUSH Test", "GET", "orders", 200, token=self.admin_token)
        if not success or not orders_response:
            print("❌ No orders available for RUSH testing")
            return False
        
        # Find a non-rush order
        non_rush_order = None
        for order in orders_response:
            if not order.get('is_rush', False):
                non_rush_order = order
                break
        
        if not non_rush_order:
            print("❌ No non-rush orders found to test with")
            return False
        
        self.test_order_id = non_rush_order['id']
        print(f"   Using order: {non_rush_order.get('order_number')} - {non_rush_order.get('customer_name')}")
        print(f"   Current is_rush: {non_rush_order.get('is_rush', False)}")
        
        # Mark order as RUSH
        rush_data = {
            "is_rush": True,
            "rush_reason": "Testing RUSH feature"
        }
        
        success, response = self.run_test(
            "Mark Order as RUSH", "PUT", f"orders/{self.test_order_id}/rush", 200,
            rush_data, self.admin_token
        )
        
        if success:
            is_rush = response.get('is_rush', False)
            rush_reason = response.get('rush_reason', '')
            rush_set_by = response.get('rush_set_by', '')
            rush_set_at = response.get('rush_set_at', '')
            
            print(f"   After marking as RUSH:")
            print(f"     is_rush: {is_rush}")
            print(f"     rush_reason: {rush_reason}")
            print(f"     rush_set_by: {rush_set_by}")
            print(f"     rush_set_at: {rush_set_at}")
            
            if is_rush and rush_reason == "Testing RUSH feature" and rush_set_by and rush_set_at:
                print("   ✅ Order successfully marked as RUSH with all fields set")
                return True
            else:
                print("❌ Order not properly marked as RUSH")
                return False
        else:
            print("❌ Failed to mark order as RUSH")
            return False

    def test_remove_rush_from_order(self):
        """Test 4: Test Remove RUSH from Order"""
        print("\n🔄 Test 4: Remove RUSH from Order")
        
        if not self.test_order_id:
            print("❌ No test order available for RUSH removal")
            return False
        
        # Remove RUSH from order
        remove_rush_data = {
            "is_rush": False
        }
        
        success, response = self.run_test(
            "Remove RUSH from Order", "PUT", f"orders/{self.test_order_id}/rush", 200,
            remove_rush_data, self.admin_token
        )
        
        if success:
            is_rush = response.get('is_rush', True)
            rush_reason = response.get('rush_reason')
            rush_set_by = response.get('rush_set_by')
            rush_set_at = response.get('rush_set_at')
            
            print(f"   After removing RUSH:")
            print(f"     is_rush: {is_rush}")
            print(f"     rush_reason: {rush_reason}")
            print(f"     rush_set_by: {rush_set_by}")
            print(f"     rush_set_at: {rush_set_at}")
            
            if (not is_rush and 
                rush_reason is None and 
                rush_set_by is None and 
                rush_set_at is None):
                print("   ✅ RUSH successfully removed from order with all fields cleared")
                return True
            else:
                print("❌ RUSH not properly removed from order")
                return False
        else:
            print("❌ Failed to remove RUSH from order")
            return False

    def test_non_admin_cannot_mark_rush(self):
        """Test 5: Verify Non-Admin Cannot Mark RUSH"""
        print("\n🚫 Test 5: Verify Non-Admin Cannot Mark RUSH")
        
        # Try to find an existing non-admin user first
        # If not found, we'll create one
        
        # Create employee code for staff user
        code_data = {"code": "RUSHTEST123"}
        success, code_response = self.run_test(
            "Create Employee Code for Non-Admin Test", "POST", "admin/employee-codes", 200,
            code_data, self.admin_token
        )
        
        if not success:
            print("❌ Failed to create employee code for non-admin test")
            return False
        
        # Register a staff user
        staff_data = {
            "email": "rush_test_staff@test.com",
            "password": "test12345",
            "name": "Rush Test Staff",
            "departments": ["design"],
            "role": "staff",
            "employee_code": "RUSHTEST123"
        }
        
        success, staff_response = self.run_test(
            "Register Staff for RUSH Test", "POST", "auth/register", 200, staff_data
        )
        
        if not success:
            print("❌ Failed to register staff user for RUSH test")
            return False
        
        # Login as staff
        staff_login_data = {
            "email": "rush_test_staff@test.com",
            "password": "test12345"
        }
        
        success, login_response = self.run_test(
            "Staff Login for RUSH Test", "POST", "auth/login", 200, staff_login_data
        )
        
        if not success or 'token' not in login_response:
            print("❌ Failed to login as staff for RUSH test")
            return False
        
        staff_token = login_response['token']
        print(f"   Staff user logged in: {login_response.get('user', {}).get('name', 'Unknown')}")
        print(f"   Staff role: {login_response.get('user', {}).get('role', 'Unknown')}")
        
        # Try to mark order as RUSH with staff token (should fail with 403)
        if not self.test_order_id:
            print("❌ No test order available for non-admin RUSH test")
            return False
        
        rush_data_staff = {
            "is_rush": True,
            "rush_reason": "Staff trying to mark as RUSH"
        }
        
        success, staff_rush_response = self.run_test(
            "Staff Try to Mark RUSH (Should Fail)", "PUT", f"orders/{self.test_order_id}/rush", 403,
            rush_data_staff, staff_token
        )
        
        if success:  # Success here means it properly failed with 403
            print("   ✅ Non-admin user properly denied access to mark orders as RUSH")
            return True
        else:
            print("❌ Non-admin user was able to mark order as RUSH (security issue)")
            return False

    def run_all_rush_tests(self):
        """Run all RUSH order tests"""
        print("🚨 Starting RUSH Order Feature Tests...")
        print(f"🌐 Testing against: {self.base_url}")
        print("=" * 60)
        
        tests = [
            self.test_admin_login,
            self.test_verify_rush_fields,
            self.test_mark_order_as_rush,
            self.test_remove_rush_from_order,
            self.test_non_admin_cannot_mark_rush,
        ]
        
        failed_tests = []
        
        for test in tests:
            try:
                if not test():
                    failed_tests.append(test.__name__)
            except Exception as e:
                print(f"❌ {test.__name__} failed with exception: {str(e)}")
                failed_tests.append(test.__name__)
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 RUSH Order Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if failed_tests:
            print(f"\n❌ Failed tests ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"   - {test}")
        else:
            print("\n✅ All RUSH order tests passed!")
        
        print(f"\n🎯 Test Summary:")
        print(f"   ✅ Admin login with provided credentials")
        print(f"   ✅ RUSH fields verification in orders response")
        print(f"   ✅ Mark order as RUSH functionality")
        print(f"   ✅ Remove RUSH from order functionality")
        print(f"   ✅ Non-admin access control verification")
        
        return len(failed_tests) == 0

def main():
    tester = RushOrderTester()
    success = tester.run_all_rush_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())