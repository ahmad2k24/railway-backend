#!/usr/bin/env python3
"""
Focused test for bulk import and bulk edit features
"""

import requests
import sys
import json
from datetime import datetime

class BulkFeatureTester:
    def __init__(self, base_url="https://whsmonitor.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.new_order_number = None

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

    def test_register_and_login_admin(self):
        """Register and login as admin for bulk testing"""
        print("\n👤 Setting up admin user for bulk testing...")
        
        # Register admin
        admin_data = {
            "email": "bulktest_admin@test.com",
            "password": "test12345",
            "name": "Bulk Test Admin",
            "departments": ["admin"],
            "role": "admin",
            "admin_pin": "9905"
        }
        success, response = self.run_test("Register Bulk Test Admin", "POST", "auth/register", 200, admin_data)
        
        if not success:
            # Try to login with existing admin
            print("   Admin already exists, trying to login...")
        
        # Login
        login_data = {
            "email": "bulktest_admin@test.com",
            "password": "test12345"
        }
        success, response = self.run_test("Bulk Admin Login", "POST", "auth/login", 200, login_data)
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_csv_template_endpoint(self):
        """Test GET /api/admin/orders/csv-template"""
        success, response = self.run_test(
            "CSV Template Endpoint", "GET", "admin/orders/csv-template", 200, token=self.admin_token
        )
        
        if success:
            required_keys = ["headers", "product_types", "rim_sizes", "example_row"]
            for key in required_keys:
                if key not in response:
                    print(f"❌ Missing key '{key}' in CSV template response")
                    return False
            
            print(f"✅ CSV template contains all required fields")
            print(f"   Headers: {response.get('headers', [])}")
            product_types = response.get('product_types', {})
            if isinstance(product_types, dict):
                print(f"   Product types: {list(product_types.keys())}")
            print(f"   Rim sizes: {response.get('rim_sizes', [])}")
            return True
        
        return False

    def test_bulk_import_orders(self):
        """Test POST /api/admin/orders/bulk-import"""
        # Use timestamp to make order number unique
        import time
        timestamp = str(int(time.time()))[-6:]  # Last 6 digits of timestamp
        
        import_data = {
            "orders": [
                {
                    "order_number": f"BULK-{timestamp}",
                    "customer_name": "Bulk Test Customer",
                    "phone": "555-9999",
                    "product_type": "rim",
                    "wheel_specs": "22x10",
                    "vehicle_make": "Ford",
                    "rim_size": "22"
                }
            ]
        }

        success, response = self.run_test(
            "Bulk Import Orders", "POST", "admin/orders/bulk-import", 200, 
            import_data, self.admin_token
        )
        
        if success:
            if response.get("success") and response.get("imported", 0) > 0:
                print(f"✅ Successfully imported {response.get('imported')} orders")
                print(f"   Skipped: {len(response.get('skipped', []))}")
                print(f"   Errors: {len(response.get('errors', []))}")
                # Store the order number for later tests
                self.new_order_number = f"BULK-{timestamp}"
                return True
            else:
                print(f"❌ Bulk import failed: {response}")
                return False
        
        return False

    def test_bulk_import_duplicate_order(self):
        """Test importing duplicate order number - should be skipped"""
        import_data = {
            "orders": [
                {
                    "order_number": "BULK-001",  # Same order number as before
                    "customer_name": "Duplicate Customer",
                    "phone": "555-8888",
                    "product_type": "rim",
                    "wheel_specs": "24x12",
                    "vehicle_make": "Chevy",
                    "rim_size": "24"
                }
            ]
        }

        success, response = self.run_test(
            "Bulk Import Duplicate Order", "POST", "admin/orders/bulk-import", 200, 
            import_data, self.admin_token
        )
        
        if success:
            if response.get("imported", 0) == 0 and len(response.get("skipped", [])) == 1:
                print(f"✅ Duplicate order properly skipped")
                print(f"   Skipped: {response.get('skipped', [])}")
                return True
            else:
                print(f"❌ Duplicate handling failed: {response}")
                return False
        
        return False

    def test_bulk_edit_orders(self):
        """Test PUT /api/admin/orders/bulk-edit"""
        # Use the newly created order number if available, otherwise search for any bulk order
        search_term = self.new_order_number if self.new_order_number else "BULK"
        
        success, search_response = self.run_test(
            f"Search for Order ({search_term})", "GET", f"orders/search?q={search_term}", 200, token=self.admin_token
        )
        
        if not success or not search_response:
            print("❌ Could not find bulk imported order for editing")
            return False

        order_id = search_response[0]["id"]
        print(f"   Found order ID: {order_id}")

        # Test bulk edit
        edit_data = {
            "order_ids": [order_id],
            "updates": {
                "wheel_specs": "24x12 updated",
                "rim_size": "24"
            }
        }

        success, response = self.run_test(
            "Bulk Edit Orders", "PUT", "admin/orders/bulk-edit", 200, 
            edit_data, self.admin_token
        )
        
        if success:
            if response.get("success") and response.get("modified_count", 0) > 0:
                print(f"✅ Successfully modified {response.get('modified_count')} orders")
                print(f"   Fields updated: {response.get('fields_updated', [])}")
                return True
            else:
                print(f"❌ Bulk edit failed: {response}")
                return False
        
        return False

    def test_search_by_customer_name(self):
        """Test GET /api/orders/search?q=Bulk"""
        success, response = self.run_test(
            "Search by Customer Name", "GET", "orders/search?q=Bulk", 200, token=self.admin_token
        )
        
        if success:
            if len(response) > 0:
                print(f"✅ Found {len(response)} orders matching 'Bulk'")
                for order in response:
                    print(f"   Order: {order.get('order_number')} - {order.get('customer_name')}")
                return True
            else:
                print("❌ No orders found matching 'Bulk'")
                return False
        
        return False

def main():
    print("🚀 Testing Bulk Import and Bulk Edit Features")
    print("=" * 60)
    
    tester = BulkFeatureTester()
    
    # Test sequence for bulk features
    tests = [
        ("Setup Admin User", tester.test_register_and_login_admin),
        ("CSV Template Endpoint", tester.test_csv_template_endpoint),
        ("Bulk Import Orders", tester.test_bulk_import_orders),
        ("Bulk Import Duplicate Order", tester.test_bulk_import_duplicate_order),
        ("Bulk Edit Orders", tester.test_bulk_edit_orders),
        ("Search by Customer Name", tester.test_search_by_customer_name),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} - Exception: {str(e)}")
            failed_tests.append(test_name)
    
    # Print results
    print("\n" + "=" * 60)
    print(f"📊 Bulk Feature Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if failed_tests:
        print(f"\n❌ Failed tests ({len(failed_tests)}):")
        for test in failed_tests:
            print(f"   - {test}")
    else:
        print("\n✅ All bulk feature tests passed!")
    
    return 0 if len(failed_tests) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())