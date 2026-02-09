#!/usr/bin/env python3
"""
Focused test for the new Corleone Forged features requested in the review
"""

import requests
import sys
import json
from datetime import datetime
import uuid

class FocusedAPITester:
    def __init__(self, base_url="https://whsmonitor.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0

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
        """Test admin login and get token"""
        login_data = {
            "email": "test-admin@test.com",
            "password": "Test123!"
        }
        success, response = self.run_test("Admin Login", "POST", "auth/login", 200, login_data)
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_customer_autocomplete(self):
        """Test GET /api/customers/autocomplete?q=DA"""
        print("\n👥 Testing Customer Autocomplete Endpoint...")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        success, response = self.run_test(
            "Customer Autocomplete with 'DA'", "GET", "customers/autocomplete?q=DA", 200,
            token=self.admin_token
        )
        
        if success:
            customers = response.get('customers', [])
            print(f"   Found {len(customers)} customers matching 'DA'")
            
            for customer in customers:
                customer_name = customer.get('customer_name', '')
                phone = customer.get('phone', '')
                order_count = customer.get('order_count', 0)
                
                print(f"   Customer: {customer_name}, Phone: {phone}, Orders: {order_count}")
                
                # Check required fields are present
                if not all(key in customer for key in ['customer_name', 'phone', 'order_count']):
                    print("❌ Customer autocomplete response missing required fields")
                    return False
            
            print("✅ Customer autocomplete working - returns customers with phone numbers and order counts")
            return True
        else:
            print("❌ Customer autocomplete request failed")
            return False

    def test_steering_wheel_toggle(self):
        """Test PUT /api/orders/{order_id}/steering-wheel"""
        print("\n🎯 Testing Steering Wheel Toggle Endpoint...")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        # Create a test order to toggle steering wheel on
        unique_id = str(uuid.uuid4())[:8]
        order_data = {
            "order_number": f"SW-TEST-{unique_id}",
            "customer_name": "Steering Wheel Test Customer",
            "phone": "555-STEER",
            "product_type": "rim",
            "wheel_specs": "22 inch rims for steering wheel test",
            "notes": "Testing steering wheel toggle functionality",
            "has_steering_wheel": False
        }
        
        success, response = self.run_test(
            "Create Order for Steering Wheel Toggle Test", "POST", "orders", 200,
            order_data, self.admin_token
        )
        
        if not success or 'id' not in response:
            print("❌ Failed to create order for steering wheel toggle test")
            return False
        
        order_id = response['id']
        print(f"   Created test order: {response.get('order_number')}")
        print(f"   Initial has_steering_wheel: {response.get('has_steering_wheel', False)}")
        
        # Test toggling steering wheel to true
        success, toggle_response = self.run_test(
            "Toggle Steering Wheel ON", "PUT", f"orders/{order_id}/steering-wheel", 200,
            token=self.admin_token
        )
        
        if success:
            has_steering_wheel_after_toggle = toggle_response.get('has_steering_wheel', False)
            print(f"   After toggle: has_steering_wheel = {has_steering_wheel_after_toggle}")
            
            if has_steering_wheel_after_toggle:
                # Test toggling back to false
                success2, toggle_response2 = self.run_test(
                    "Toggle Steering Wheel OFF", "PUT", f"orders/{order_id}/steering-wheel", 200,
                    token=self.admin_token
                )
                
                if success2:
                    has_steering_wheel_after_second_toggle = toggle_response2.get('has_steering_wheel', True)
                    print(f"   After second toggle: has_steering_wheel = {has_steering_wheel_after_second_toggle}")
                    
                    if not has_steering_wheel_after_second_toggle:
                        print("✅ Steering wheel toggle working correctly - toggles between true/false")
                        return True
                    else:
                        print("❌ Second toggle failed - should be False")
                        return False
                else:
                    print("❌ Second toggle request failed")
                    return False
            else:
                print("❌ First toggle failed - should be True")
                return False
        else:
            print("❌ First toggle request failed")
            return False

    def test_new_order_fields(self):
        """Test creating orders with new fields: has_steering_wheel, has_custom_caps, has_race_car_caps"""
        print("\n🆕 Testing New Order Fields...")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        # Test creating order with all new fields set to true
        unique_id = str(uuid.uuid4())[:8]
        order_data = {
            "order_number": f"NEW-FIELDS-{unique_id}",
            "customer_name": "New Fields Test Customer",
            "phone": "555-NEWF",
            "product_type": "rim",
            "wheel_specs": "24 inch rims with all new features",
            "notes": "Testing all new order fields",
            "has_steering_wheel": True,
            "has_custom_caps": True,
            "has_race_car_caps": True
        }
        
        success, response = self.run_test(
            "Create Order with New Fields", "POST", "orders", 200,
            order_data, self.admin_token
        )
        
        if success and 'id' in response:
            order_id = response['id']
            print(f"   Created order: {response.get('order_number')}")
            
            # Verify all new fields are saved correctly
            fields_to_check = [
                ("has_steering_wheel", True),
                ("has_custom_caps", True),
                ("has_race_car_caps", True)
            ]
            
            all_fields_correct = True
            for field_name, expected_value in fields_to_check:
                actual_value = response.get(field_name, False)
                if actual_value != expected_value:
                    print(f"❌ Field '{field_name}' not saved correctly: expected {expected_value}, got {actual_value}")
                    all_fields_correct = False
                else:
                    print(f"   ✅ {field_name}: {actual_value}")
            
            if all_fields_correct:
                # Test retrieving the order to verify fields persist
                success2, get_response = self.run_test(
                    "Get Order to Verify New Fields", "GET", f"orders/{order_id}", 200,
                    token=self.admin_token
                )
                
                if success2:
                    print("   Verifying fields persist after retrieval:")
                    persist_check_passed = True
                    for field_name, expected_value in fields_to_check:
                        actual_value = get_response.get(field_name, False)
                        if actual_value != expected_value:
                            print(f"❌ Field '{field_name}' not persisted: expected {expected_value}, got {actual_value}")
                            persist_check_passed = False
                        else:
                            print(f"   ✅ {field_name} persisted: {actual_value}")
                    
                    if persist_check_passed:
                        print("✅ All new order fields working correctly - saved and persisted")
                        return True
                    else:
                        print("❌ Some new fields not persisted correctly")
                        return False
                else:
                    print("❌ Failed to retrieve order for persistence check")
                    return False
            else:
                print("❌ Some new fields were not saved correctly")
                return False
        else:
            print("❌ Failed to create order with new fields")
            return False

def main():
    print("🚀 Testing New Corleone Forged Features")
    print("=" * 50)
    
    tester = FocusedAPITester()
    
    # Test sequence for the specific features requested
    tests = [
        ("Admin Login", tester.test_admin_login),
        ("Customer Autocomplete Endpoint", tester.test_customer_autocomplete),
        ("Steering Wheel Toggle Endpoint", tester.test_steering_wheel_toggle),
        ("New Order Fields", tester.test_new_order_fields),
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
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if failed_tests:
        print(f"\n❌ Failed tests ({len(failed_tests)}):")
        for test in failed_tests:
            print(f"   - {test}")
    else:
        print("\n✅ All new features working correctly!")
    
    return 0 if len(failed_tests) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())