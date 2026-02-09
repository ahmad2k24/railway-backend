#!/usr/bin/env python3
"""
Test script for new Corleone Forged features
"""

import requests
import json
import uuid
from datetime import datetime

class NewFeaturesTest:
    def __init__(self):
        self.base_url = "https://whsmonitor.preview.emergentagent.com"
        self.api_url = f"{self.base_url}/api"
        self.admin_token = None
        
    def login_admin(self):
        """Login as existing admin"""
        login_data = {
            "email": "newfeatures_admin@test.com",
            "password": "test12345"
        }
        
        response = requests.post(f"{self.api_url}/auth/login", json=login_data)
        if response.status_code == 200:
            self.admin_token = response.json()['token']
            print(f"✅ Admin login successful")
            return True
        else:
            print(f"❌ Admin login failed: {response.status_code}")
            return False
    
    def test_custom_caps_order(self):
        """Test creating custom caps order"""
        unique_id = str(uuid.uuid4())[:8]
        order_data = {
            "order_number": f"CUSTOM-CAPS-{unique_id}",
            "customer_name": "Custom Caps Customer",
            "phone": "555-CAPS",
            "product_type": "custom_caps",
            "wheel_specs": "Custom designed caps with logo",
            "notes": "Special custom caps order",
            "quantity": 4
        }
        
        headers = {'Authorization': f'Bearer {self.admin_token}', 'Content-Type': 'application/json'}
        response = requests.post(f"{self.api_url}/orders", json=order_data, headers=headers)
        
        if response.status_code == 200:
            print(f"✅ Custom caps order created: {response.json().get('order_number')}")
            return True, response.json()['id']
        else:
            print(f"❌ Custom caps order failed: {response.status_code} - {response.json()}")
            return False, None
    
    def test_race_car_caps_order(self):
        """Test creating race car caps order"""
        unique_id = str(uuid.uuid4())[:8]
        order_data = {
            "order_number": f"RACE-CAPS-{unique_id}",
            "customer_name": "Race Car Caps Customer",
            "phone": "555-RACE",
            "product_type": "race_car_caps",
            "wheel_specs": "Racing style caps with aerodynamic design",
            "notes": "High performance race car caps",
            "quantity": 4
        }
        
        headers = {'Authorization': f'Bearer {self.admin_token}', 'Content-Type': 'application/json'}
        response = requests.post(f"{self.api_url}/orders", json=order_data, headers=headers)
        
        if response.status_code == 200:
            print(f"✅ Race car caps order created: {response.json().get('order_number')}")
            return True, response.json()['id']
        else:
            print(f"❌ Race car caps order failed: {response.status_code} - {response.json()}")
            return False, None
    
    def test_tires_toggle(self):
        """Test tires toggle functionality"""
        # Create a rim order first
        unique_id = str(uuid.uuid4())[:8]
        order_data = {
            "order_number": f"TIRES-TEST-{unique_id}",
            "customer_name": "Tires Test Customer",
            "phone": "555-TIRE",
            "product_type": "rim",
            "wheel_specs": "22 inch rims for tires test",
            "notes": "Testing tires toggle functionality",
            "has_tires": False
        }
        
        headers = {'Authorization': f'Bearer {self.admin_token}', 'Content-Type': 'application/json'}
        response = requests.post(f"{self.api_url}/orders", json=order_data, headers=headers)
        
        if response.status_code != 200:
            print(f"❌ Failed to create rim order for tires test: {response.status_code}")
            return False
        
        order_id = response.json()['id']
        print(f"✅ Created rim order for tires test: {response.json().get('order_number')}")
        
        # Test toggle to True
        response = requests.put(f"{self.api_url}/orders/{order_id}/tires", headers=headers)
        if response.status_code == 200:
            has_tires = response.json().get('has_tires')
            if has_tires:
                print(f"✅ Tires toggle to True successful")
                
                # Test toggle back to False
                response = requests.put(f"{self.api_url}/orders/{order_id}/tires", headers=headers)
                if response.status_code == 200:
                    has_tires = response.json().get('has_tires')
                    if not has_tires:
                        print(f"✅ Tires toggle to False successful")
                        return True
                    else:
                        print(f"❌ Tires toggle to False failed")
                        return False
                else:
                    print(f"❌ Second tires toggle failed: {response.status_code}")
                    return False
            else:
                print(f"❌ Tires toggle to True failed")
                return False
        else:
            print(f"❌ First tires toggle failed: {response.status_code}")
            return False
    
    def test_lalo_status_update(self):
        """Test lalo status update"""
        # Create a rim order first
        unique_id = str(uuid.uuid4())[:8]
        order_data = {
            "order_number": f"LALO-TEST-{unique_id}",
            "customer_name": "Lalo Test Customer",
            "phone": "555-LALO",
            "product_type": "rim",
            "wheel_specs": "24 inch rims for gold dipping",
            "notes": "Testing lalo status functionality",
            "lalo_status": "not_sent"
        }
        
        headers = {'Authorization': f'Bearer {self.admin_token}', 'Content-Type': 'application/json'}
        response = requests.post(f"{self.api_url}/orders", json=order_data, headers=headers)
        
        if response.status_code != 200:
            print(f"❌ Failed to create rim order for lalo test: {response.status_code}")
            return False
        
        order_id = response.json()['id']
        print(f"✅ Created rim order for lalo test: {response.json().get('order_number')}")
        
        # Test updating lalo status
        lalo_data = {"lalo_status": "shipped_to_lalo"}
        response = requests.put(f"{self.api_url}/orders/{order_id}/lalo-status", json=lalo_data, headers=headers)
        
        if response.status_code == 200:
            lalo_status = response.json().get('lalo_status')
            if lalo_status == "shipped_to_lalo":
                print(f"✅ Lalo status update successful: {lalo_status}")
                return True
            else:
                print(f"❌ Lalo status update failed - wrong status: {lalo_status}")
                return False
        else:
            print(f"❌ Lalo status update failed: {response.status_code}")
            return False
    
    def test_lalo_queue(self):
        """Test lalo queue endpoint"""
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        response = requests.get(f"{self.api_url}/orders/lalo-queue", headers=headers)
        
        if response.status_code == 200:
            orders = response.json()
            print(f"✅ Lalo queue endpoint working - found {len(orders)} orders")
            
            # Verify all orders have lalo_status != "not_sent"
            for order in orders:
                lalo_status = order.get('lalo_status', 'not_sent')
                if lalo_status == 'not_sent':
                    print(f"❌ Found order with 'not_sent' status: {order.get('order_number')}")
                    return False
            
            print(f"✅ All orders in lalo queue have correct status")
            return True
        else:
            print(f"❌ Lalo queue endpoint failed: {response.status_code}")
            return False
    
    def test_lalo_statuses(self):
        """Test lalo statuses endpoint"""
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        response = requests.get(f"{self.api_url}/lalo-statuses", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            lalo_statuses = data.get('lalo_statuses', {})
            print(f"✅ Lalo statuses endpoint working - found {len(lalo_statuses)} statuses")
            
            expected_statuses = ["not_sent", "shipped_to_lalo", "at_lalo", "returned", "waiting_shipping"]
            for status in expected_statuses:
                if status not in lalo_statuses:
                    print(f"❌ Missing expected lalo status: {status}")
                    return False
            
            print(f"✅ All expected lalo statuses present")
            return True
        else:
            print(f"❌ Lalo statuses endpoint failed: {response.status_code}")
            return False
    
    def test_full_order_update(self):
        """Test full order update"""
        # Create an order first
        unique_id = str(uuid.uuid4())[:8]
        order_data = {
            "order_number": f"FULL-UPDATE-{unique_id}",
            "customer_name": "Full Update Customer",
            "phone": "555-FULL",
            "product_type": "rim",
            "wheel_specs": "Original specs",
            "notes": "Original notes",
            "vehicle_make": "Original Make",
            "vehicle_model": "Original Model",
            "rim_size": "22",
            "has_tires": False,
            "lalo_status": "not_sent"
        }
        
        headers = {'Authorization': f'Bearer {self.admin_token}', 'Content-Type': 'application/json'}
        response = requests.post(f"{self.api_url}/orders", json=order_data, headers=headers)
        
        if response.status_code != 200:
            print(f"❌ Failed to create order for full update test: {response.status_code}")
            return False
        
        order_id = response.json()['id']
        print(f"✅ Created order for full update test: {response.json().get('order_number')}")
        
        # Test full order update
        update_data = {
            "order_number": f"EDITED-{unique_id}",
            "customer_name": "Edited Customer",
            "phone": "555-EDIT",
            "wheel_specs": "Edited specs",
            "vehicle_make": "Edited Make",
            "vehicle_model": "Edited Model",
            "rim_size": "24",
            "notes": "Edited notes",
            "has_tires": True,
            "lalo_status": "at_lalo"
        }
        
        response = requests.put(f"{self.api_url}/orders/{order_id}", json=update_data, headers=headers)
        
        if response.status_code == 200:
            updated_order = response.json()
            print(f"✅ Full order update successful")
            
            # Verify all fields were updated
            fields_to_check = [
                ("order_number", f"EDITED-{unique_id}"),
                ("customer_name", "Edited Customer"),
                ("phone", "555-EDIT"),
                ("wheel_specs", "Edited specs"),
                ("vehicle_make", "Edited Make"),
                ("vehicle_model", "Edited Model"),
                ("rim_size", "24"),
                ("notes", "Edited notes"),
                ("has_tires", True),
                ("lalo_status", "at_lalo")
            ]
            
            all_correct = True
            for field_name, expected_value in fields_to_check:
                actual_value = updated_order.get(field_name)
                if actual_value != expected_value:
                    print(f"❌ Field '{field_name}' not updated: expected '{expected_value}', got '{actual_value}'")
                    all_correct = False
            
            if all_correct:
                print(f"✅ All fields updated correctly")
                return True
            else:
                return False
        else:
            print(f"❌ Full order update failed: {response.status_code}")
            return False

def main():
    print("🚀 Testing New Corleone Forged Features")
    print("=" * 50)
    
    tester = NewFeaturesTest()
    
    # Login first
    if not tester.login_admin():
        print("❌ Cannot proceed without admin login")
        return 1
    
    # Run tests
    tests = [
        ("Custom Caps Order", tester.test_custom_caps_order),
        ("Race Car Caps Order", tester.test_race_car_caps_order),
        ("Tires Toggle", tester.test_tires_toggle),
        ("Lalo Status Update", tester.test_lalo_status_update),
        ("Lalo Queue Endpoint", tester.test_lalo_queue),
        ("Lalo Statuses Endpoint", tester.test_lalo_statuses),
        ("Full Order Update", tester.test_full_order_update),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        print(f"\n🔍 Testing {test_name}...")
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ {test_name} - Exception: {str(e)}")
            failed += 1
    
    print(f"\n" + "=" * 50)
    print(f"📊 Results: {passed}/{passed + failed} tests passed")
    
    if failed == 0:
        print("✅ All new features working correctly!")
        return 0
    else:
        print(f"❌ {failed} tests failed")
        return 1

if __name__ == "__main__":
    exit(main())