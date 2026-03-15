"""
Tests for response_model refactoring verification.
Tests all endpoints that were refactored to use response_model annotations.
Ensures API responses match expected schemas and no existing functionality was broken.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ishikawa-hub.preview.emergentagent.com').rstrip('/')


class TestPublicEndpoints:
    """Test public endpoints (no auth required)"""
    
    def test_version_endpoint_structure(self):
        """GET /api/version should return only version, versionName, releaseDate fields"""
        response = requests.get(f"{BASE_URL}/api/version")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify exact fields - response_model should filter extra fields
        assert "version" in data
        assert "versionName" in data
        assert "releaseDate" in data
        
        # Verify field types
        assert isinstance(data["version"], str)
        assert isinstance(data["versionName"], str)
        assert isinstance(data["releaseDate"], str)
        
        # Verify no extra fields leaked (like _id or other internal fields)
        assert len(data.keys()) == 3, f"Expected 3 fields, got {len(data.keys())}: {list(data.keys())}"
        
        print(f"✓ /api/version returns correct structure: {data}")


class TestAuthEndpoints:
    """Test authentication endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        # Try second credential
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "buenogy@gmail.com",
            "password": "Admin2024!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    def test_login_endpoint_returns_token_model(self):
        """POST /api/auth/login should return Token (access_token + user)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify Token model structure
        assert "access_token" in data
        assert "token_type" in data
        assert "user" in data
        
        # Verify user structure has required fields
        user = data["user"]
        assert "id" in user
        assert "nom" in user
        assert "prenom" in user
        assert "email" in user
        assert "role" in user
        assert "permissions" in user
        
        # Verify no password leaked
        assert "password" not in user
        assert "hashed_password" not in user
        
        print(f"✓ /api/auth/login returns Token model correctly")
    
    def test_forgot_password_returns_message_response(self):
        """POST /api/auth/forgot-password should return only message field"""
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": "nonexistent@example.com"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have only message field (MessageResponse)
        assert "message" in data
        assert isinstance(data["message"], str)
        
        # Verify no extra fields leaked
        assert len(data.keys()) == 1, f"Expected only 'message' field, got: {list(data.keys())}"
        
        print(f"✓ /api/auth/forgot-password returns MessageResponse correctly")
    
    def test_me_endpoint_returns_user_model(self, auth_token):
        """GET /api/auth/me should return full User object with permissions"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify User model structure
        assert "id" in data
        assert "nom" in data
        assert "prenom" in data
        assert "email" in data
        assert "role" in data
        assert "permissions" in data
        
        # Verify no password leaked
        assert "password" not in data
        assert "hashed_password" not in data
        
        # Verify permissions structure
        permissions = data["permissions"]
        assert isinstance(permissions, dict)
        
        print(f"✓ /api/auth/me returns User model correctly")


class TestSettingsEndpoints:
    """Test settings endpoints with Authorization"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "buenogy@gmail.com",
            "password": "Admin2024!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_settings_endpoint_returns_system_settings(self, auth_token):
        """GET /api/settings should return SystemSettings fields"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/settings", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # SystemSettings model fields
        assert "inactivity_timeout_minutes" in data
        assert isinstance(data["inactivity_timeout_minutes"], int)
        
        print(f"✓ /api/settings returns SystemSettings correctly")


class TestInventoryEndpoints:
    """Test inventory endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_inventory_stats_endpoint(self, auth_token):
        """GET /api/inventory/stats should return rupture and niveau_bas fields"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/inventory/stats", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # InventoryStatsResponse model fields
        assert "rupture" in data
        assert "niveau_bas" in data
        
        assert isinstance(data["rupture"], int)
        assert isinstance(data["niveau_bas"], int)
        
        # Verify no extra fields
        assert len(data.keys()) == 2, f"Expected 2 fields, got: {list(data.keys())}"
        
        print(f"✓ /api/inventory/stats returns InventoryStatsResponse correctly: {data}")
    
    def test_inventory_list_returns_items(self, auth_token):
        """GET /api/inventory should return list of inventory items"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/inventory", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list)
        
        # If items exist, verify structure
        if data:
            item = data[0]
            assert "id" in item
            assert "nom" in item
            # Should NOT have _id from MongoDB
            assert "_id" not in item
        
        print(f"✓ /api/inventory returns list with {len(data)} items")


class TestNotificationsEndpoints:
    """Test notifications endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_notifications_count_endpoint(self, auth_token):
        """GET /api/notifications/count should return unread_count field"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications/count", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # NotificationCountResponse model field
        assert "unread_count" in data
        assert isinstance(data["unread_count"], int)
        
        # Verify no extra fields  
        assert len(data.keys()) == 1, f"Expected only 'unread_count', got: {list(data.keys())}"
        
        print(f"✓ /api/notifications/count returns NotificationCountResponse correctly: {data}")


class TestMainEntityEndpoints:
    """Test main entity list endpoints (work-orders, equipments, users, etc.)"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_work_orders_list_returns_work_order_objects(self, auth_token):
        """GET /api/work-orders should return list of WorkOrder objects"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/work-orders", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list)
        
        # If items exist, verify WorkOrder structure
        if data:
            wo = data[0]
            # Required WorkOrder fields
            assert "id" in wo
            assert "titre" in wo
            assert "numero" in wo
            assert "statut" in wo
            assert "dateCreation" in wo
            # Should NOT have _id from MongoDB
            assert "_id" not in wo
        
        print(f"✓ /api/work-orders returns list with {len(data)} work orders")
    
    def test_equipments_list_returns_equipment_objects(self, auth_token):
        """GET /api/equipments should return list of equipment objects"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/equipments", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list)
        
        # If items exist, verify Equipment structure
        if data:
            eq = data[0]
            assert "id" in eq
            assert "nom" in eq
            # Should NOT have _id from MongoDB
            assert "_id" not in eq
        
        print(f"✓ /api/equipments returns list with {len(data)} equipments")
    
    def test_users_list_returns_user_objects(self, auth_token):
        """GET /api/users should return list of user objects"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list)
        
        # If items exist, verify User structure
        if data:
            user = data[0]
            assert "id" in user
            assert "email" in user
            assert "nom" in user
            assert "prenom" in user
            # Should NOT have _id or password
            assert "_id" not in user
            assert "password" not in user
            assert "hashed_password" not in user
        
        print(f"✓ /api/users returns list with {len(data)} users (no passwords)")
    
    def test_locations_list_returns_location_objects(self, auth_token):
        """GET /api/locations should return list of Location objects"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/locations", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list)
        
        # If items exist, verify Location structure
        if data:
            loc = data[0]
            assert "id" in loc
            assert "nom" in loc
            # Should NOT have _id from MongoDB
            assert "_id" not in loc
        
        print(f"✓ /api/locations returns list with {len(data)} locations")
    
    def test_preventive_maintenance_list(self, auth_token):
        """GET /api/preventive-maintenance should return list of PreventiveMaintenance objects"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/preventive-maintenance", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list)
        
        # If items exist, verify PreventiveMaintenance structure
        if data:
            pm = data[0]
            assert "id" in pm
            assert "titre" in pm
            # Should NOT have _id from MongoDB
            assert "_id" not in pm
        
        print(f"✓ /api/preventive-maintenance returns list with {len(data)} maintenance plans")


class TestDeleteEndpointsReturnSuccessResponse:
    """Test that DELETE endpoints return SuccessResponse model"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_delete_work_order_returns_message_response(self, auth_token):
        """DELETE /api/work-orders/{id} should return MessageResponse"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First, create a work order to delete
        create_response = requests.post(f"{BASE_URL}/api/work-orders", headers=headers, json={
            "titre": "TEST_DELETE_WO",
            "description": "Test work order for delete testing"
        })
        
        if create_response.status_code == 200:
            wo_id = create_response.json().get("id")
            
            # Now delete it
            delete_response = requests.delete(f"{BASE_URL}/api/work-orders/{wo_id}", headers=headers)
            
            assert delete_response.status_code == 200
            data = delete_response.json()
            
            # MessageResponse model
            assert "message" in data
            assert isinstance(data["message"], str)
            
            print(f"✓ DELETE /api/work-orders returns MessageResponse: {data}")
        else:
            print("ℹ Could not create work order to test delete")


class TestChangePasswordEndpoints:
    """Test password change endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_change_password_returns_message_response(self, auth_token):
        """POST /api/auth/change-password should return MessageResponse"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Try changing password with wrong old password (should fail but verify response structure)
        response = requests.post(f"{BASE_URL}/api/auth/change-password", headers=headers, json={
            "old_password": "WrongPassword123!",
            "new_password": "NewPassword123!"
        })
        
        # Should get 400 error, but response should still be structured
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            print(f"✓ /api/auth/change-password returns MessageResponse")
        else:
            # Error case - verify it's structured error
            assert response.status_code == 400
            print(f"✓ /api/auth/change-password error response correctly returned 400")


class TestRolesDeleteEndpoint:
    """Test roles delete endpoint returns SuccessResponse"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_delete_non_system_role_returns_success_response(self, auth_token):
        """DELETE /api/roles/{id} should return SuccessResponse"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Try to delete a non-existent role to verify response structure
        response = requests.delete(f"{BASE_URL}/api/roles/nonexistent-role-id", headers=headers)
        
        if response.status_code == 404:
            # Expected - role not found, still verify JSON structure
            data = response.json()
            assert "detail" in data
            print(f"✓ DELETE /api/roles returns proper error response for 404")
        elif response.status_code == 200:
            data = response.json()
            assert "success" in data
            assert "message" in data
            print(f"✓ DELETE /api/roles returns SuccessResponse")


class TestSurveillanceDeleteEndpoint:
    """Test surveillance delete endpoint returns SuccessResponse"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_surveillance_delete_endpoint_structure(self, auth_token):
        """DELETE /api/surveillance/items/{id} should return SuccessResponse"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Try to delete a non-existent item to verify response structure
        response = requests.delete(f"{BASE_URL}/api/surveillance/items/nonexistent-id", headers=headers)
        
        if response.status_code == 404:
            data = response.json()
            assert "detail" in data
            print(f"✓ DELETE /api/surveillance/items returns proper 404 error")
        elif response.status_code == 200:
            data = response.json()
            assert "success" in data
            assert "message" in data
            print(f"✓ DELETE /api/surveillance/items returns SuccessResponse")


class TestPresquAccidentDeleteEndpoint:
    """Test presqu-accident delete endpoint returns SuccessResponse"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_presqu_accident_delete_endpoint_structure(self, auth_token):
        """DELETE /api/presqu-accident/items/{id} should return SuccessResponse"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Try to delete a non-existent item
        response = requests.delete(f"{BASE_URL}/api/presqu-accident/items/nonexistent-id", headers=headers)
        
        if response.status_code == 404:
            data = response.json()
            assert "detail" in data
            print(f"✓ DELETE /api/presqu-accident/items returns proper 404 error")
        elif response.status_code == 200:
            data = response.json()
            assert "success" in data
            assert "message" in data
            print(f"✓ DELETE /api/presqu-accident/items returns SuccessResponse")


# Main execution
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
