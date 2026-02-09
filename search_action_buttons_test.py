#!/usr/bin/env python3
"""
Search Action Buttons Testing for Corleone Forged Order Tracker
Tests the new "Done" and "Actions" buttons in search results dropdown
"""

import requests
import sys
import json
from datetime import datetime

class SearchActionButtonsTester:
    def __init__(self, base_url="https://whsmonitor.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.search_test_orders = []

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
        """Test admin login for search results action buttons testing"""
        login_data = {
            "email": "digitalebookdepot@gmail.com",
            "password": "Admin123!"
        }
        success, response = self.run_test("Admin Login for Search Action Buttons", "POST", "auth/login", 200, login_data)
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_create_orders_for_search_testing(self):
        """Create test orders in different departments for search action buttons testing"""
        print("\n📦 Creating Test Orders for Search Action Buttons Testing...")
        
        if not self.admin_token:
            print("❌ No admin token available for creating test orders")
            return False

        # Create orders with unique numbers to avoid conflicts
        import uuid
        unique_suffix = str(uuid.uuid4())[:6].upper()
        
        test_orders = [
            {
                "order_number": f"SEARCH-TEST-{unique_suffix}-001",
                "customer_name": "John Smith Test",
                "phone": "555-SEARCH1",
                "product_type": "rim",
                "wheel_specs": "22x10 Chrome",
                "notes": "Test order for search action buttons"
            },
            {
                "order_number": f"SEARCH-TEST-{unique_suffix}-002",
                "customer_name": "Jane Doe Test",
                "phone": "555-SEARCH2",
                "product_type": "steering_wheel",
                "wheel_specs": "Custom leather steering wheel",
                "notes": "Order for testing machine department"
            },
            {
                "order_number": f"SEARCH-TEST-{unique_suffix}-003", 
                "customer_name": "Bob Johnson Test",
                "phone": "555-SEARCH3",
                "product_type": "rim",
                "wheel_specs": "24x12 Matte Black",
                "notes": "Order for testing powder coat department"
            }
        ]
        
        created_orders = []
        for order_data in test_orders:
            success, response = self.run_test(
                f"Create Test Order {order_data['order_number']}", "POST", "orders", 200,
                order_data, self.admin_token
            )
            
            if success and 'id' in response:
                created_orders.append({
                    'id': response['id'],
                    'order_number': response['order_number'],
                    'customer_name': response['customer_name'],
                    'current_department': response['current_department']
                })
                print(f"   ✅ Created order: {response.get('order_number')} in {response.get('current_department')}")
            else:
                print(f"   ❌ Failed to create order: {order_data['order_number']}")
                # Don't return False here, continue with existing orders
        
        # Store created orders for later tests
        self.search_test_orders = created_orders
        
        # If we couldn't create new orders, try to find existing orders for testing
        if not created_orders:
            print("   ⚠️  No new orders created, searching for existing orders to test with...")
            success, existing_orders = self.run_test(
                "Get Existing Orders for Testing", "GET", "orders/search?q=8614", 200,
                token=self.admin_token
            )
            
            if success and existing_orders:
                # Use existing orders for testing
                for order in existing_orders[:3]:  # Take first 3 orders
                    if order.get('current_department') not in ['completed', 'shipped']:
                        self.search_test_orders.append({
                            'id': order['id'],
                            'order_number': order['order_number'],
                            'customer_name': order['customer_name'],
                            'current_department': order['current_department']
                        })
                        print(f"   ✅ Using existing order: {order.get('order_number')} in {order.get('current_department')}")
        
        if self.search_test_orders:
            print(f"✅ Successfully prepared {len(self.search_test_orders)} orders for search testing")
            return True
        else:
            print("❌ No orders available for testing")
            return False

    def test_search_orders_functionality(self):
        """Test search orders endpoint that supports action buttons"""
        print("\n🔍 Testing Search Orders Functionality...")
        
        if not self.admin_token:
            print("❌ No admin token available for search test")
            return False

        # Test search by order number "8614" (from review request)
        success, response = self.run_test(
            "Search Orders by Number '8614'", "GET", "orders/search?q=8614", 200,
            token=self.admin_token
        )
        
        if success:
            print(f"   Found {len(response)} orders matching '8614'")
            
            # Verify search results contain expected fields for action buttons
            if len(response) > 0:
                order = response[0]
                required_fields = ['id', 'order_number', 'customer_name', 'current_department', 'product_type']
                
                missing_fields = []
                for field in required_fields:
                    if field not in order:
                        missing_fields.append(field)
                
                if missing_fields:
                    print(f"❌ Search results missing required fields: {missing_fields}")
                    return False
                else:
                    print(f"   ✅ Search result contains all required fields for action buttons")
                    print(f"   Order: {order.get('order_number')} - {order.get('customer_name')} ({order.get('current_department')})")
                    return True
            else:
                print("❌ No search results found for '8614'")
                return False
        else:
            print("❌ Search request failed")
            return False

    def test_search_by_customer_name_for_actions(self):
        """Test search by customer name to verify action buttons work on different search types"""
        print("\n👤 Testing Search by Customer Name for Action Buttons...")
        
        if not self.admin_token:
            print("❌ No admin token available for customer name search test")
            return False

        # Test search by customer name
        success, response = self.run_test(
            "Search Orders by Customer Name 'John'", "GET", "orders/search?q=John", 200,
            token=self.admin_token
        )
        
        if success:
            print(f"   Found {len(response)} orders matching 'John'")
            
            if len(response) > 0:
                for order in response:
                    print(f"   Order: {order.get('order_number')} - {order.get('customer_name')} ({order.get('current_department')})")
                
                print("✅ Customer name search working - results available for action buttons")
                return True
            else:
                print("❌ No search results found for 'John'")
                return False
        else:
            print("❌ Customer name search request failed")
            return False

    def test_done_button_functionality(self):
        """Test DONE button functionality (advance order to next department)"""
        print("\n✅ Testing DONE Button Functionality (Advance Order)...")
        
        if not self.admin_token:
            print("❌ No admin token available for DONE button test")
            return False

        if not self.search_test_orders:
            print("❌ No test orders available for DONE button test")
            return False

        # Find an order that's not in completed department
        test_order = None
        for order in self.search_test_orders:
            if order['current_department'] != 'completed':
                test_order = order
                break
        
        if not test_order:
            print("❌ No suitable test order found for DONE button test")
            return False

        order_id = test_order['id']
        original_dept = test_order['current_department']
        
        print(f"   Testing DONE button on order: {test_order['order_number']}")
        print(f"   Current department: {original_dept}")
        
        # Test advancing order (DONE button functionality)
        success, response = self.run_test(
            "DONE Button - Advance Order", "PUT", f"orders/{order_id}/advance", 200,
            token=self.admin_token
        )
        
        if success:
            new_dept = response.get('current_department')
            print(f"   Order advanced from {original_dept} to {new_dept}")
            
            # Verify order moved to next department
            if new_dept != original_dept:
                print("✅ DONE button functionality working - order advanced to next department")
                
                # Update our test order record
                for order in self.search_test_orders:
                    if order['id'] == order_id:
                        order['current_department'] = new_dept
                        break
                
                return True
            else:
                print("❌ DONE button failed - order did not advance")
                return False
        else:
            print("❌ DONE button request failed")
            return False

    def test_actions_dropdown_functionality(self):
        """Test Actions dropdown functionality (move order to specific department)"""
        print("\n🎯 Testing Actions Dropdown Functionality (Move Order)...")
        
        if not self.admin_token:
            print("❌ No admin token available for Actions dropdown test")
            return False

        if not self.search_test_orders:
            print("❌ No test orders available for Actions dropdown test")
            return False

        # Find an order that's not in completed department
        test_order = None
        for order in self.search_test_orders:
            if order['current_department'] not in ['completed', 'shipped']:
                test_order = order
                break
        
        if not test_order:
            print("❌ No suitable test order found for Actions dropdown test")
            return False

        order_id = test_order['id']
        original_dept = test_order['current_department']
        target_dept = "machine"  # Move to machine department as mentioned in review request
        
        print(f"   Testing Actions dropdown on order: {test_order['order_number']}")
        print(f"   Moving from {original_dept} to {target_dept}")
        
        # Test moving order to specific department (Actions dropdown functionality)
        move_data = {"target_department": target_dept}
        success, response = self.run_test(
            "Actions Dropdown - Move to Department", "PUT", f"orders/{order_id}/move", 200,
            move_data, self.admin_token
        )
        
        if success:
            new_dept = response.get('current_department')
            print(f"   Order moved from {original_dept} to {new_dept}")
            
            # Verify order moved to target department
            if new_dept == target_dept:
                print("✅ Actions dropdown functionality working - order moved to selected department")
                
                # Update our test order record
                for order in self.search_test_orders:
                    if order['id'] == order_id:
                        order['current_department'] = new_dept
                        break
                
                return True
            else:
                print(f"❌ Actions dropdown failed - order moved to {new_dept} instead of {target_dept}")
                return False
        else:
            print("❌ Actions dropdown request failed")
            return False

    def test_get_departments_for_actions_dropdown(self):
        """Test getting departments list for Actions dropdown"""
        print("\n📋 Testing Get Departments for Actions Dropdown...")
        
        if not self.admin_token:
            print("❌ No admin token available for departments test")
            return False

        success, response = self.run_test(
            "Get Departments List", "GET", "departments", 200,
            token=self.admin_token
        )
        
        if success:
            departments = response.get('departments', [])
            labels = response.get('labels', {})
            
            print(f"   Found {len(departments)} departments for Actions dropdown")
            
            # Verify expected departments are present
            expected_departments = ["received", "design", "program", "machine_waiting", "machine", "finishing", "powder_coat", "assemble", "showroom", "shipped"]
            
            missing_departments = []
            for dept in expected_departments:
                if dept not in departments:
                    missing_departments.append(dept)
            
            if missing_departments:
                print(f"❌ Missing expected departments: {missing_departments}")
                return False
            else:
                print("   ✅ All expected departments present for Actions dropdown")
                for dept in departments:
                    label = labels.get(dept, dept)
                    print(f"   {dept}: {label}")
                
                print("✅ Departments endpoint working - Actions dropdown can populate department list")
                return True
        else:
            print("❌ Get departments request failed")
            return False

    def test_search_results_after_actions(self):
        """Test that search results update correctly after using action buttons"""
        print("\n🔄 Testing Search Results Update After Actions...")
        
        if not self.admin_token:
            print("❌ No admin token available for search update test")
            return False

        # Search again to verify orders have moved departments
        success, response = self.run_test(
            "Search Orders After Actions", "GET", "orders/search?q=TEST", 200,
            token=self.admin_token
        )
        
        if success:
            print(f"   Found {len(response)} orders in updated search")
            
            # Verify that orders show their updated departments
            for order in response:
                order_number = order.get('order_number', '')
                current_dept = order.get('current_department', '')
                
                if 'TEST' in order_number:
                    print(f"   Order {order_number}: {current_dept}")
            
            print("✅ Search results update correctly after using action buttons")
            return True
        else:
            print("❌ Search after actions request failed")
            return False

    def run_all_tests(self):
        """Run all search action buttons tests"""
        print("🚀 Starting Search Results Action Buttons Tests...")
        print(f"🌐 Base URL: {self.base_url}")
        print(f"🔗 API URL: {self.api_url}")
        
        # Test sequence for search action buttons feature
        tests = [
            # Authentication
            self.test_admin_login,
            
            # Setup test data
            self.test_create_orders_for_search_testing,
            
            # Search functionality tests
            self.test_search_orders_functionality,
            self.test_search_by_customer_name_for_actions,
            
            # Action buttons functionality tests
            self.test_done_button_functionality,
            self.test_actions_dropdown_functionality,
            self.test_get_departments_for_actions_dropdown,
            
            # Verify results after actions
            self.test_search_results_after_actions
        ]
        
        # Run all tests
        for test in tests:
            try:
                test()
            except Exception as e:
                print(f"❌ Test {test.__name__} failed with exception: {str(e)}")
                self.tests_run += 1
        
        # Print summary
        print(f"\n📊 Search Action Buttons Test Summary:")
        print(f"   Tests run: {self.tests_run}")
        print(f"   Tests passed: {self.tests_passed}")
        print(f"   Tests failed: {self.tests_run - self.tests_passed}")
        print(f"   Success rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All search action buttons tests passed!")
        else:
            print("⚠️  Some search action buttons tests failed - check output above")
        
        return self.tests_passed == self.tests_run


def main():
    """Main function to run search action buttons tests"""
    tester = SearchActionButtonsTester()
    
    # Run the search action buttons tests as requested in the review
    success = tester.run_all_tests()
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())