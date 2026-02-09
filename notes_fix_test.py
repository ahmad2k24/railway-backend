#!/usr/bin/env python3
"""
Corleone Forged Order Tracking System - Notes Fix Testing
Tests the specific fix for notes appearing in BOTH admin notes field AND conversation timeline
"""

import requests
import sys
import json
from datetime import datetime

class NotesFixTester:
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

    def test_create_order_with_notes(self):
        """Test 1: Create order WITH notes - verify both fields populated"""
        print("\n📝 Test 1: Create Order WITH Notes")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        order_data = {
            "order_number": "NOTES-FIX-TEST-001",
            "customer_name": "Notes Fix Test Customer",
            "phone": "555-NOTES",
            "product_type": "rim",
            "wheel_specs": "22x10 Chrome",
            "notes": "This note should appear in BOTH admin notes AND conversation timeline"
        }
        
        success, response = self.run_test(
            "Create Order WITH Notes", "POST", "orders", 200,
            order_data, self.admin_token
        )
        
        if success and 'id' in response:
            order_id = response['id']
            print(f"   Created order: {response.get('order_number')}")
            
            # Verify notes field is populated
            notes_field = response.get('notes', '')
            expected_note = "This note should appear in BOTH admin notes AND conversation timeline"
            
            if notes_field == expected_note:
                print(f"   ✅ Admin notes field populated: {notes_field}")
            else:
                print(f"   ❌ Admin notes field incorrect: expected '{expected_note}', got '{notes_field}'")
                return False
            
            # Verify order_notes array has at least 1 entry with the same note
            order_notes = response.get('order_notes', [])
            if len(order_notes) >= 1:
                first_note = order_notes[0]
                note_text = first_note.get('text', '')
                
                if note_text == expected_note:
                    print(f"   ✅ Conversation timeline populated: {note_text}")
                    
                    # Verify proper structure of order_notes entry
                    required_fields = ['id', 'text', 'created_by', 'created_by_name', 'department', 'created_at']
                    all_fields_present = True
                    
                    for field in required_fields:
                        if field not in first_note:
                            print(f"   ❌ Missing field '{field}' in order_notes entry")
                            all_fields_present = False
                        else:
                            print(f"   ✅ {field}: {first_note[field]}")
                    
                    if all_fields_present:
                        print("   ✅ Order notes entry has proper structure")
                        self.order_with_notes_id = order_id  # Store for retrieval test
                        return True
                    else:
                        print("   ❌ Order notes entry missing required fields")
                        return False
                else:
                    print(f"   ❌ Conversation timeline text incorrect: expected '{expected_note}', got '{note_text}'")
                    return False
            else:
                print(f"   ❌ Order notes array empty or missing: {order_notes}")
                return False
        else:
            print("   ❌ Failed to create order with notes")
            return False

    def test_create_order_without_notes(self):
        """Test 2: Create order WITHOUT notes - verify empty arrays"""
        print("\n📝 Test 2: Create Order WITHOUT Notes")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        order_data_no_notes = {
            "order_number": "NOTES-FIX-TEST-002",
            "customer_name": "No Notes Test Customer",
            "phone": "555-NONOTES",
            "product_type": "rim",
            "wheel_specs": "20x8 Black",
            "notes": ""  # Empty notes
        }
        
        success, response = self.run_test(
            "Create Order WITHOUT Notes", "POST", "orders", 200,
            order_data_no_notes, self.admin_token
        )
        
        if success and 'id' in response:
            order_id = response['id']
            print(f"   Created order: {response.get('order_number')}")
            
            # Verify notes field is empty string
            notes_field = response.get('notes', '')
            if notes_field == "":
                print(f"   ✅ Admin notes field empty as expected")
            else:
                print(f"   ❌ Admin notes field should be empty, got: '{notes_field}'")
                return False
            
            # Verify order_notes array is empty
            order_notes = response.get('order_notes', [])
            if len(order_notes) == 0:
                print(f"   ✅ Conversation timeline empty as expected")
                return True
            else:
                print(f"   ❌ Conversation timeline should be empty, got: {order_notes}")
                return False
        else:
            print("   ❌ Failed to create order without notes")
            return False

    def test_order_retrieval_persistence(self):
        """Test 3: Verify order retrieval persists both fields"""
        print("\n📝 Test 3: Verify Order Retrieval Persistence")
        
        if not self.admin_token:
            print("❌ No admin token available")
            return False

        if not hasattr(self, 'order_with_notes_id'):
            print("❌ No order with notes available for retrieval test")
            return False

        success, get_response = self.run_test(
            "Get Order to Verify Persistence", "GET", f"orders/{self.order_with_notes_id}", 200,
            token=self.admin_token
        )
        
        if success:
            expected_note = "This note should appear in BOTH admin notes AND conversation timeline"
            
            # Verify both fields persist correctly
            persisted_notes = get_response.get('notes', '')
            persisted_order_notes = get_response.get('order_notes', [])
            
            if persisted_notes == expected_note:
                print(f"   ✅ Admin notes field persisted correctly")
            else:
                print(f"   ❌ Admin notes field not persisted: expected '{expected_note}', got '{persisted_notes}'")
                return False
            
            if len(persisted_order_notes) >= 1 and persisted_order_notes[0].get('text') == expected_note:
                print(f"   ✅ Conversation timeline persisted correctly")
                return True
            else:
                print(f"   ❌ Conversation timeline not persisted correctly: {persisted_order_notes}")
                return False
        else:
            print("   ❌ Failed to retrieve order for persistence check")
            return False

    def run_notes_fix_tests(self):
        """Run all notes fix tests"""
        print("🚀 Starting Notes Fix Tests for Corleone Forged Order Tracking System...")
        print(f"   Base URL: {self.base_url}")
        print(f"   API URL: {self.api_url}")
        print(f"   Testing with admin credentials: digitalebookdepot@gmail.com")
        
        tests = [
            self.test_admin_login,
            self.test_create_order_with_notes,
            self.test_create_order_without_notes,
            self.test_order_retrieval_persistence
        ]
        
        for test in tests:
            try:
                if not test():
                    print(f"\n❌ CRITICAL FAILURE: {test.__name__} failed")
                    break
            except Exception as e:
                print(f"❌ Test {test.__name__} failed with exception: {str(e)}")
                self.tests_run += 1
                break
        
        # Print summary
        print(f"\n📊 Notes Fix Test Summary:")
        print(f"   Tests run: {self.tests_run}")
        print(f"   Tests passed: {self.tests_passed}")
        print(f"   Tests failed: {self.tests_run - self.tests_passed}")
        
        if self.tests_passed == self.tests_run:
            print("\n✅ NOTES FIX VERIFIED - Notes appear in BOTH admin notes AND conversation timeline")
            return True
        else:
            print(f"\n❌ NOTES FIX FAILED - {self.tests_run - self.tests_passed} test(s) failed")
            return False

if __name__ == "__main__":
    tester = NotesFixTester()
    success = tester.run_notes_fix_tests()
    sys.exit(0 if success else 1)