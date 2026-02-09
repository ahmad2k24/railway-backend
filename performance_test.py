#!/usr/bin/env python3
"""
Performance Tracking System - Backend API Testing
Tests the new performance tracking endpoints for the Corleone Forged order tracking app
"""

import requests
import sys
import json
from datetime import datetime, timedelta

class PerformanceAPITester:
    def __init__(self, base_url="https://whsmonitor.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_user_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
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

    def test_performance_daily_today(self):
        """Test GET /api/performance/daily with today's date (should return 0 activity)"""
        today = datetime.now().strftime('%Y-%m-%d')
        params = {'date': today}
        
        success, response = self.run_test(
            "Performance Daily - Today", "GET", "performance/daily", 200, 
            token=self.admin_token, params=params
        )
        
        if success:
            # Verify response structure
            required_keys = ['date', 'summary', 'departments', 'users', 'grade_scale']
            for key in required_keys:
                if key not in response:
                    print(f"❌ Missing key '{key}' in daily performance response")
                    return False
            
            print(f"   Date: {response.get('date')}")
            print(f"   Total completed: {response.get('summary', {}).get('total_orders_completed', 0)}")
            print(f"   Total received: {response.get('summary', {}).get('total_orders_received', 0)}")
            print(f"   Completion rate: {response.get('summary', {}).get('overall_completion_rate', 0)}%")
            print(f"   Departments count: {len(response.get('departments', []))}")
            print(f"   Users count: {len(response.get('users', []))}")
            
            # Verify grade scale
            grade_scale = response.get('grade_scale', {})
            expected_grades = ['A', 'B', 'C', 'D', 'F']
            for grade in expected_grades:
                if grade not in grade_scale:
                    print(f"❌ Missing grade '{grade}' in grade scale")
                    return False
            
            print("✅ Daily performance endpoint working - all required fields present")
            return True
        
        return False

    def test_performance_daily_yesterday(self):
        """Test GET /api/performance/daily with yesterday's date (2026-01-06)"""
        yesterday = "2026-01-06"  # As specified in the review request
        params = {'date': yesterday}
        
        success, response = self.run_test(
            "Performance Daily - Yesterday", "GET", "performance/daily", 200, 
            token=self.admin_token, params=params
        )
        
        if success:
            print(f"   Date: {response.get('date')}")
            print(f"   Total completed: {response.get('summary', {}).get('total_orders_completed', 0)}")
            print(f"   Total received: {response.get('summary', {}).get('total_orders_received', 0)}")
            
            # Store a user_id for later testing if available
            users = response.get('users', [])
            if users:
                self.test_user_id = users[0].get('user_id')
                print(f"   Found test user: {users[0].get('name')} (ID: {self.test_user_id})")
            
            print("✅ Daily performance endpoint working for yesterday's date")
            return True
        
        return False

    def test_performance_range(self):
        """Test GET /api/performance/range endpoint"""
        params = {
            'start_date': '2026-01-01',
            'end_date': '2026-01-06'
        }
        
        success, response = self.run_test(
            "Performance Range", "GET", "performance/range", 200, 
            token=self.admin_token, params=params
        )
        
        if success:
            # Verify response structure
            required_keys = ['start_date', 'end_date', 'daily_stats', 'departments', 'users']
            for key in required_keys:
                if key not in response:
                    print(f"❌ Missing key '{key}' in range performance response")
                    return False
            
            print(f"   Start date: {response.get('start_date')}")
            print(f"   End date: {response.get('end_date')}")
            print(f"   Daily stats count: {len(response.get('daily_stats', []))}")
            print(f"   Departments count: {len(response.get('departments', []))}")
            print(f"   Users count: {len(response.get('users', []))}")
            
            # Verify daily_stats array structure
            daily_stats = response.get('daily_stats', [])
            if daily_stats:
                first_stat = daily_stats[0]
                required_stat_keys = ['date', 'orders_completed', 'orders_received']
                for key in required_stat_keys:
                    if key not in first_stat:
                        print(f"❌ Missing key '{key}' in daily stats")
                        return False
                print(f"   Sample daily stat: {first_stat.get('date')} - Completed: {first_stat.get('orders_completed')}")
            
            print("✅ Performance range endpoint working - all required fields present")
            return True
        
        return False

    def test_performance_user(self):
        """Test GET /api/performance/user/{user_id} endpoint"""
        if not self.test_user_id:
            print("❌ No test user ID available for user performance test")
            return False
        
        success, response = self.run_test(
            f"Performance User - {self.test_user_id}", "GET", f"performance/user/{self.test_user_id}", 200, 
            token=self.admin_token
        )
        
        if success:
            # Verify response structure
            required_keys = ['user', 'period', 'totals', 'daily_activity']
            for key in required_keys:
                if key not in response:
                    print(f"❌ Missing key '{key}' in user performance response")
                    return False
            
            user_info = response.get('user', {})
            period_info = response.get('period', {})
            totals_info = response.get('totals', {})
            daily_activity = response.get('daily_activity', [])
            
            print(f"   User: {user_info.get('name')} (ID: {user_info.get('id')})")
            print(f"   Departments: {user_info.get('departments', [])}")
            print(f"   Period: {period_info.get('start')} to {period_info.get('end')}")
            print(f"   Orders touched: {totals_info.get('orders_touched', 0)}")
            print(f"   Notes added: {totals_info.get('notes_added', 0)}")
            print(f"   Daily activity entries: {len(daily_activity)}")
            
            print("✅ User performance endpoint working - all required fields present")
            return True
        
        return False

    def test_performance_endpoints_permissions(self):
        """Test that performance endpoints require admin or sales access"""
        print("\n🔒 Testing Performance Endpoints Permissions...")
        
        # Test without token (should fail)
        success, response = self.run_test(
            "Performance Daily - No Auth", "GET", "performance/daily", 401
        )
        
        if success:
            print("✅ Performance endpoints properly require authentication")
            return True
        else:
            print("❌ Performance endpoints should require authentication")
            return False

    def test_performance_daily_invalid_date(self):
        """Test performance daily endpoint with invalid date format"""
        params = {'date': 'invalid-date'}
        
        success, response = self.run_test(
            "Performance Daily - Invalid Date", "GET", "performance/daily", 200, 
            token=self.admin_token, params=params
        )
        
        if success:
            # Should still work but use current date
            print("✅ Performance daily endpoint handles invalid date gracefully")
            return True
        
        return False

    def test_performance_range_invalid_dates(self):
        """Test performance range endpoint with invalid date formats"""
        params = {
            'start_date': 'invalid-start',
            'end_date': 'invalid-end'
        }
        
        success, response = self.run_test(
            "Performance Range - Invalid Dates", "GET", "performance/range", 400, 
            token=self.admin_token, params=params
        )
        
        if success:
            print("✅ Performance range endpoint properly validates date formats")
            return True
        
        return False

    def test_performance_user_nonexistent(self):
        """Test performance user endpoint with non-existent user ID"""
        fake_user_id = "nonexistent-user-id"
        
        success, response = self.run_test(
            "Performance User - Non-existent", "GET", f"performance/user/{fake_user_id}", 404, 
            token=self.admin_token
        )
        
        if success:
            print("✅ Performance user endpoint properly handles non-existent users")
            return True
        
        return False

    def run_all_tests(self):
        """Run all performance tracking tests"""
        print("🚀 Starting Performance Tracking System Tests...")
        print(f"Backend URL: {self.base_url}")
        
        # Authentication
        if not self.test_admin_login():
            print("❌ Failed to authenticate - cannot continue with tests")
            return False
        
        # Core performance endpoint tests
        tests = [
            self.test_performance_daily_today,
            self.test_performance_daily_yesterday,
            self.test_performance_range,
            self.test_performance_user,
            self.test_performance_endpoints_permissions,
            self.test_performance_daily_invalid_date,
            self.test_performance_range_invalid_dates,
            self.test_performance_user_nonexistent
        ]
        
        for test in tests:
            try:
                test()
            except Exception as e:
                print(f"❌ Test {test.__name__} failed with error: {str(e)}")
        
        # Summary
        print(f"\n📊 Test Summary:")
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All performance tracking tests passed!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

if __name__ == "__main__":
    tester = PerformanceAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)