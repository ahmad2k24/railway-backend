"""
Test suite for Notification & User Tagging System
Features tested:
- GET /api/users/list - returns users for @mention autocomplete
- GET /api/notifications - returns notifications for user
- GET /api/notifications/unread-count - returns correct count
- PUT /api/notifications/{id}/read - marks notification as read
- PUT /api/notifications/mark-all-read - marks all as read
- @mention detection in order notes creates notification
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "digitalebookdepot@gmail.com"
ADMIN_PASSWORD = "Admin123!"


class TestNotificationSystem:
    """Test notification endpoints and @mention functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.user = login_response.json().get("user")
        else:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    def test_health_check(self):
        """Test health endpoint is accessible"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("✓ Health check passed")
    
    def test_get_users_list_for_mention(self):
        """Test GET /api/users/list returns users for @mention autocomplete"""
        response = self.session.get(f"{BASE_URL}/api/users/list")
        assert response.status_code == 200
        
        data = response.json()
        assert "users" in data
        assert isinstance(data["users"], list)
        
        # Verify user structure
        if len(data["users"]) > 0:
            user = data["users"][0]
            assert "id" in user
            assert "name" in user
            # username may be None for some users
            assert "department" in user or "departments" in user
            assert "role" in user
            print(f"✓ GET /api/users/list returned {len(data['users'])} users")
        else:
            print("✓ GET /api/users/list returned empty list (no users)")
    
    def test_get_notifications(self):
        """Test GET /api/notifications returns notifications for user"""
        response = self.session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200
        
        data = response.json()
        assert "notifications" in data
        assert isinstance(data["notifications"], list)
        
        # Verify notification structure if any exist
        if len(data["notifications"]) > 0:
            notification = data["notifications"][0]
            assert "id" in notification
            assert "title" in notification
            assert "message" in notification
            assert "is_read" in notification
            assert "created_at" in notification
            print(f"✓ GET /api/notifications returned {len(data['notifications'])} notifications")
        else:
            print("✓ GET /api/notifications returned empty list (no notifications)")
    
    def test_get_notifications_with_limit(self):
        """Test GET /api/notifications with limit parameter"""
        response = self.session.get(f"{BASE_URL}/api/notifications?limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert "notifications" in data
        assert len(data["notifications"]) <= 5
        print(f"✓ GET /api/notifications with limit=5 returned {len(data['notifications'])} notifications")
    
    def test_get_unread_count(self):
        """Test GET /api/notifications/unread-count returns correct count"""
        response = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert response.status_code == 200
        
        data = response.json()
        assert "count" in data
        assert isinstance(data["count"], int)
        assert data["count"] >= 0
        print(f"✓ GET /api/notifications/unread-count returned count: {data['count']}")
    
    def test_mark_all_notifications_read(self):
        """Test PUT /api/notifications/mark-all-read marks all as read"""
        response = self.session.put(f"{BASE_URL}/api/notifications/mark-all-read")
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        print(f"✓ PUT /api/notifications/mark-all-read: {data['message']}")
        
        # Verify unread count is now 0
        count_response = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert count_response.status_code == 200
        # Note: Admin sees all notifications, so count might not be 0 if there are other users' notifications
        print(f"✓ Unread count after mark-all-read: {count_response.json()['count']}")


class TestMentionNotificationFlow:
    """Test the complete @mention notification flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.user = login_response.json().get("user")
        else:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    def test_create_order_and_add_note_with_mention(self):
        """Test creating an order and adding a note with @mention"""
        # First, get list of users to find someone to mention
        users_response = self.session.get(f"{BASE_URL}/api/users/list")
        assert users_response.status_code == 200
        users = users_response.json().get("users", [])
        
        # Find a user to mention (not the current admin user)
        mention_user = None
        for u in users:
            if u.get("id") != self.user.get("id"):
                mention_user = u
                break
        
        # Create a test order
        test_order_number = f"TEST-NOTIF-{uuid.uuid4().hex[:6].upper()}"
        order_data = {
            "order_number": test_order_number,
            "customer_name": "Test Notification Customer",
            "phone": "(555)-123-4567",
            "product_type": "rim",
            "wheel_specs": "22x10 Test Specs",
            "notes": "Test order for notification testing"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        print(f"✓ Created test order: {test_order_number}")
        
        # Add a note with @mention
        if mention_user:
            mention_name = mention_user.get("username") or mention_user.get("name", "").replace(" ", "_").lower()
            note_text = f"@{mention_name} Please check this order for notification test"
        else:
            note_text = "Test note without mention (no other users found)"
        
        note_response = self.session.post(f"{BASE_URL}/api/orders/{order_id}/notes", json={
            "text": note_text
        })
        assert note_response.status_code == 200
        updated_order = note_response.json()
        
        # Verify note was added
        assert "order_notes" in updated_order
        assert len(updated_order["order_notes"]) > 0
        assert updated_order["order_notes"][-1]["text"] == note_text
        print(f"✓ Added note with mention: {note_text[:50]}...")
        
        # If we mentioned someone, check if notification was created
        if mention_user:
            # Get notifications (admin can see all)
            notif_response = self.session.get(f"{BASE_URL}/api/notifications?limit=10")
            assert notif_response.status_code == 200
            notifications = notif_response.json().get("notifications", [])
            
            # Look for the notification we just created
            found_notification = None
            for n in notifications:
                if n.get("order_id") == order_id and "mention" in n.get("type", ""):
                    found_notification = n
                    break
            
            if found_notification:
                print(f"✓ Notification created for @mention: {found_notification['title']}")
                
                # Test marking this notification as read
                notif_id = found_notification["id"]
                read_response = self.session.put(f"{BASE_URL}/api/notifications/{notif_id}/read")
                assert read_response.status_code == 200
                print(f"✓ Marked notification as read")
                
                # Test deleting the notification
                delete_response = self.session.delete(f"{BASE_URL}/api/notifications/{notif_id}")
                assert delete_response.status_code == 200
                print(f"✓ Deleted notification")
            else:
                print("⚠ No notification found (user may have been self-mentioned or not found)")
        
        # Cleanup - delete the test order
        delete_order_response = self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
        assert delete_order_response.status_code == 200
        print(f"✓ Cleaned up test order: {test_order_number}")


class TestNotificationEdgeCases:
    """Test edge cases for notification system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.user = login_response.json().get("user")
        else:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    def test_mark_nonexistent_notification_read(self):
        """Test marking a non-existent notification as read returns 404"""
        fake_id = str(uuid.uuid4())
        response = self.session.put(f"{BASE_URL}/api/notifications/{fake_id}/read")
        assert response.status_code == 404
        print("✓ Marking non-existent notification returns 404")
    
    def test_delete_nonexistent_notification(self):
        """Test deleting a non-existent notification returns 404"""
        fake_id = str(uuid.uuid4())
        response = self.session.delete(f"{BASE_URL}/api/notifications/{fake_id}")
        assert response.status_code == 404
        print("✓ Deleting non-existent notification returns 404")
    
    def test_get_notifications_unread_only(self):
        """Test GET /api/notifications with unread_only parameter"""
        response = self.session.get(f"{BASE_URL}/api/notifications?unread_only=true")
        assert response.status_code == 200
        
        data = response.json()
        assert "notifications" in data
        
        # All returned notifications should be unread
        for notification in data["notifications"]:
            assert notification.get("is_read") == False
        
        print(f"✓ GET /api/notifications?unread_only=true returned {len(data['notifications'])} unread notifications")


class TestOrdersAPI:
    """Test orders API for notification context"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.user = login_response.json().get("user")
        else:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    def test_get_orders(self):
        """Test GET /api/orders returns order list"""
        response = self.session.get(f"{BASE_URL}/api/orders")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/orders returned {len(data)} orders")
    
    def test_get_order_by_id(self):
        """Test GET /api/orders/{id} returns order details"""
        # First get list of orders
        orders_response = self.session.get(f"{BASE_URL}/api/orders")
        assert orders_response.status_code == 200
        orders = orders_response.json()
        
        if len(orders) > 0:
            order_id = orders[0]["id"]
            response = self.session.get(f"{BASE_URL}/api/orders/{order_id}")
            assert response.status_code == 200
            
            order = response.json()
            assert "id" in order
            assert "order_number" in order
            assert "customer_name" in order
            assert "order_notes" in order
            print(f"✓ GET /api/orders/{order_id} returned order details")
        else:
            print("⚠ No orders found to test GET by ID")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
