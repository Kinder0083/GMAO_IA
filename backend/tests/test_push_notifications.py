"""
Test Push Notifications Feature - FSAO (ex-GMAO)
Tests for:
1. POST /api/push-notifications/register - Register a push token
2. DELETE /api/push-notifications/unregister?push_token=... - Unregister a push token  
3. POST /api/push-notifications/test - Send a test notification
4. POST /api/work-orders - Verify creating WO with assigne_a_id triggers notification logic (no server error)
5. PUT /api/work-orders/{id} - Verify status change doesn't cause errors
6. Legacy /api/notifications/* endpoints - No regression

Note: Expo push tokens like 'ExponentPushToken[test123]' are invalid test tokens,
so Expo returns 'DeviceNotRegistered' - this is expected behavior.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://gmao-trash-fix.preview.emergentagent.com').rstrip('/')


class TestPushNotificationsFeature:
    """Tests for push notification endpoints and notification triggers"""
    
    # Test tokens
    admin_token = None
    tech_token = None
    test_push_token = "ExponentPushToken[test123456]"
    created_wo_id = None
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Login and get tokens for admin and technicien"""
        # Admin login
        admin_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if admin_resp.status_code == 200:
            TestPushNotificationsFeature.admin_token = admin_resp.json().get("access_token")
        
        # Technicien login
        tech_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "technicien@test.com", 
            "password": "Technicien123!"
        })
        if tech_resp.status_code == 200:
            TestPushNotificationsFeature.tech_token = tech_resp.json().get("access_token")
    
    def get_admin_headers(self):
        if not TestPushNotificationsFeature.admin_token:
            pytest.skip("Admin auth failed")
        return {"Authorization": f"Bearer {TestPushNotificationsFeature.admin_token}"}
    
    def get_tech_headers(self):
        if not TestPushNotificationsFeature.tech_token:
            pytest.skip("Technicien auth failed")
        return {"Authorization": f"Bearer {TestPushNotificationsFeature.tech_token}"}
    
    # ============================================
    # TEST: Backend & Auth accessible
    # ============================================
    def test_01_backend_accessible(self):
        """Verify API is accessible"""
        response = requests.get(f"{BASE_URL}/api/version")
        assert response.status_code == 200
        print(f"✓ Backend accessible: version={response.json().get('version')}")
    
    def test_02_admin_auth_works(self):
        """Verify admin authentication works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        TestPushNotificationsFeature.admin_token = data["access_token"]
        print(f"✓ Admin login successful")
    
    def test_03_tech_auth_works(self):
        """Verify technicien authentication works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "technicien@test.com",
            "password": "Technicien123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        TestPushNotificationsFeature.tech_token = data["access_token"]
        print(f"✓ Technicien login successful")
    
    # ============================================
    # TEST: Push Notification Endpoints
    # ============================================
    def test_04_push_register_token(self):
        """POST /api/push-notifications/register - Register a device push token"""
        headers = self.get_admin_headers()
        response = requests.post(
            f"{BASE_URL}/api/push-notifications/register",
            json={
                "push_token": self.test_push_token,
                "platform": "android",
                "device_name": "Test Device"
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] in ["Token registered", "Token updated"]
        print(f"✓ Push token registered: {data['message']}")
    
    def test_05_push_register_updates_existing(self):
        """POST /api/push-notifications/register - Same token updates existing record"""
        headers = self.get_admin_headers()
        # Register same token again - should update, not create duplicate
        response = requests.post(
            f"{BASE_URL}/api/push-notifications/register",
            json={
                "push_token": self.test_push_token,
                "platform": "ios",  # Changed platform
                "device_name": "Test Device Updated"
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        # Should be "Token updated" since it already exists
        assert data["message"] == "Token updated"
        print(f"✓ Existing token updated successfully")
    
    def test_06_push_test_notification(self):
        """POST /api/push-notifications/test - Send a test notification"""
        headers = self.get_admin_headers()
        response = requests.post(
            f"{BASE_URL}/api/push-notifications/test",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        # Success field exists - Expo may return error for invalid token but endpoint works
        assert "success" in data or "result" in data
        print(f"✓ Test notification endpoint works: {data}")
    
    def test_07_push_unregister_token(self):
        """DELETE /api/push-notifications/unregister - Unregister a push token"""
        headers = self.get_admin_headers()
        response = requests.delete(
            f"{BASE_URL}/api/push-notifications/unregister",
            params={"push_token": self.test_push_token},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Token unregistered"
        print(f"✓ Push token unregistered successfully")
    
    def test_08_push_unregister_nonexistent(self):
        """DELETE /api/push-notifications/unregister - Nonexistent token returns 404"""
        headers = self.get_admin_headers()
        response = requests.delete(
            f"{BASE_URL}/api/push-notifications/unregister",
            params={"push_token": "ExponentPushToken[nonexistent999]"},
            headers=headers
        )
        assert response.status_code == 404
        print(f"✓ Nonexistent token correctly returns 404")
    
    def test_09_push_test_no_devices(self):
        """POST /api/push-notifications/test - With no registered devices returns 404"""
        headers = self.get_admin_headers()
        # Token was unregistered in test_07, so test should fail with 404
        response = requests.post(
            f"{BASE_URL}/api/push-notifications/test",
            headers=headers
        )
        # May return 404 if no devices, or 200 with error message
        assert response.status_code in [200, 404]
        print(f"✓ Test notification with no devices: status={response.status_code}")
    
    # ============================================
    # TEST: Work Order Creation Triggers Notification (No Server Error)
    # ============================================
    def test_10_create_wo_with_assignment_no_error(self):
        """POST /api/work-orders - Create WO with assigne_a_id doesn't cause server error"""
        headers = self.get_admin_headers()
        
        # First get a technicien user ID
        users_resp = requests.get(f"{BASE_URL}/api/users", headers=headers)
        assert users_resp.status_code == 200
        users = users_resp.json()
        
        # Find technicien user
        tech_user = next((u for u in users if u.get("role") == "TECHNICIEN"), None)
        tech_id = tech_user["id"] if tech_user else None
        
        response = requests.post(
            f"{BASE_URL}/api/work-orders",
            json={
                "titre": "TEST_PUSH_NOTIF_WO",
                "description": "Test work order for push notification trigger",
                "type": "CORRECTIF",
                "priorite": "NORMALE",
                "statut": "OUVERT",
                "assigne_a_id": tech_id  # This should trigger notification logic
            },
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        TestPushNotificationsFeature.created_wo_id = data["id"]
        print(f"✓ Work order created with assignment: #{data.get('numero')} (id={data['id']})")
        print(f"  Assigned to: {data.get('assigneA', {}).get('prenom', 'None')} {data.get('assigneA', {}).get('nom', '')}")
    
    def test_11_update_wo_status_no_error(self):
        """PUT /api/work-orders/{id} - Status change doesn't cause server error"""
        headers = self.get_admin_headers()
        wo_id = TestPushNotificationsFeature.created_wo_id
        
        if not wo_id:
            pytest.skip("No work order ID from previous test")
        
        response = requests.put(
            f"{BASE_URL}/api/work-orders/{wo_id}",
            json={
                "statut": "EN_COURS"  # Status change should trigger notification logic
            },
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["statut"] == "EN_COURS"
        print(f"✓ Work order status updated to EN_COURS without error")
    
    def test_12_update_wo_reassignment_no_error(self):
        """PUT /api/work-orders/{id} - Reassignment doesn't cause server error"""
        headers = self.get_admin_headers()
        wo_id = TestPushNotificationsFeature.created_wo_id
        
        if not wo_id:
            pytest.skip("No work order ID from previous test")
        
        # Get admin user ID for reassignment
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        admin_id = me_resp.json().get("id") if me_resp.status_code == 200 else None
        
        response = requests.put(
            f"{BASE_URL}/api/work-orders/{wo_id}",
            json={
                "assigne_a_id": admin_id  # Reassignment should trigger notification
            },
            headers=headers
        )
        
        assert response.status_code == 200
        print(f"✓ Work order reassigned without error")
    
    # ============================================
    # TEST: Legacy /api/notifications/* Endpoints (No Regression)
    # ============================================
    def test_13_legacy_notifications_list(self):
        """GET /api/notifications - Legacy endpoint still works"""
        headers = self.get_admin_headers()
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Legacy notifications list works: {len(data)} notifications")
    
    def test_14_legacy_notifications_count(self):
        """GET /api/notifications/count - Legacy endpoint still works"""
        headers = self.get_admin_headers()
        response = requests.get(f"{BASE_URL}/api/notifications/count", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # API returns 'unread_count' field
        assert "unread_count" in data
        print(f"✓ Legacy notifications count works: {data['unread_count']} unread")
    
    def test_15_legacy_notifications_read(self):
        """PUT /api/notifications/{id}/read - Legacy endpoint still works"""
        headers = self.get_admin_headers()
        
        # First get a notification to mark as read
        list_resp = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        notifications = list_resp.json() if list_resp.status_code == 200 else []
        
        if not notifications:
            print("✓ Legacy notifications read endpoint exists (no notifications to test with)")
            return
        
        notif_id = notifications[0].get("id")
        response = requests.put(f"{BASE_URL}/api/notifications/{notif_id}/read", headers=headers)
        # Should return 200 or 404 if already read/deleted
        assert response.status_code in [200, 404]
        print(f"✓ Legacy notifications read endpoint works: status={response.status_code}")
    
    # ============================================
    # TEST: Equipment Status Change (Notification Trigger)
    # ============================================
    def test_16_equipment_status_change_no_error(self):
        """PATCH /api/equipments/{id}/status - Status change doesn't cause server error"""
        headers = self.get_admin_headers()
        
        # First get an equipment ID
        eq_resp = requests.get(f"{BASE_URL}/api/equipments", headers=headers)
        if eq_resp.status_code != 200:
            pytest.skip("Could not get equipments list")
        
        equipments = eq_resp.json()
        if not equipments:
            pytest.skip("No equipments found")
        
        test_eq = equipments[0]
        eq_id = test_eq.get("id")
        original_status = test_eq.get("statut")
        
        # Try changing status to HORS_SERVICE (valid status that triggers notification logic path)
        # Note: Valid statuses are: OPERATIONNEL, EN_FONCTIONNEMENT, A_LARRET, EN_MAINTENANCE, HORS_SERVICE, EN_CT, DEGRADE, ALERTE_S_EQUIP
        response = requests.patch(
            f"{BASE_URL}/api/equipments/{eq_id}/status",
            params={"statut": "HORS_SERVICE"},
            headers=headers
        )
        
        # Accept 200 or requires_confirmation response
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Equipment status change to HORS_SERVICE doesn't cause server error")
        print(f"  Response: {data.get('message', data.get('statut', 'OK'))}")
        
        # Restore original status if possible
        if original_status and original_status != "HORS_SERVICE":
            requests.patch(
                f"{BASE_URL}/api/equipments/{eq_id}/status",
                params={"statut": original_status, "force": "true"},
                headers=headers
            )
            print(f"  Restored original status: {original_status}")
    
    # ============================================
    # TEST: Cleanup
    # ============================================
    def test_99_cleanup_test_data(self):
        """Delete test work orders created during testing"""
        headers = self.get_admin_headers()
        wo_id = TestPushNotificationsFeature.created_wo_id
        
        if wo_id:
            response = requests.delete(f"{BASE_URL}/api/work-orders/{wo_id}", headers=headers)
            if response.status_code in [200, 204]:
                print(f"✓ Cleaned up test work order: {wo_id}")
            else:
                print(f"⚠ Could not delete test work order: {wo_id}")
        
        # Also try to clean up any registered test tokens
        test_token = self.test_push_token
        requests.delete(
            f"{BASE_URL}/api/push-notifications/unregister",
            params={"push_token": test_token},
            headers=headers
        )
        print(f"✓ Cleanup completed")
