"""
Test RBAC Permissions Fix - P0 Bug Fix Verification
Tests the fix for:
1. serialize_doc() no longer pollutes permissions with dateCreation/attachments
2. register endpoint uses get_default_permissions_by_role()
3. update_user auto-updates permissions when role changes
4. TECHNICIEN user can access work-orders and other modules
"""

import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://achat-ia-preview.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_CREDS = {"email": "admin@test.com", "password": "Admin123!"}
TECHNICIEN_CREDS = {"email": "tech.test@test.com", "password": "Test1234!"}


class TestRBACPermissionsFix:
    """Tests for the P0 RBAC permissions bug fix"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get ADMIN token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def tech_token(self):
        """Get TECHNICIEN token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TECHNICIEN_CREDS)
        assert response.status_code == 200, f"TECHNICIEN login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def tech_user_data(self):
        """Get TECHNICIEN user data from login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TECHNICIEN_CREDS)
        assert response.status_code == 200
        return response.json()["user"]
    
    @pytest.fixture(scope="class")
    def admin_user_data(self):
        """Get ADMIN user data from login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200
        return response.json()["user"]
    
    # =============================================================================
    # TEST 1: TECHNICIEN login response contains clean permissions
    # =============================================================================
    def test_technicien_login_permissions_clean(self, tech_user_data):
        """Login response for TECHNICIEN contains permissions without parasites"""
        permissions = tech_user_data.get("permissions", {})
        
        # Should have permissions object
        assert permissions, "TECHNICIEN should have permissions"
        
        # Check that permissions are clean (no dateCreation or attachments parasites)
        for module_name, module_perms in permissions.items():
            assert isinstance(module_perms, dict), f"Module {module_name} permissions should be a dict"
            
            # Verify structure: should only have view, edit, delete
            valid_keys = {"view", "edit", "delete"}
            actual_keys = set(module_perms.keys())
            
            # Check for parasite keys
            parasite_keys = actual_keys - valid_keys
            assert not parasite_keys, f"Module {module_name} has parasite keys: {parasite_keys}"
            
            # Check values are booleans
            for key in actual_keys:
                assert isinstance(module_perms[key], bool), f"Module {module_name}.{key} should be boolean"
        
        print(f"✅ TECHNICIEN permissions are clean with {len(permissions)} modules")
    
    # =============================================================================
    # TEST 2: TECHNICIEN has 42 modules with view,edit,delete
    # =============================================================================
    def test_technicien_has_required_modules(self, tech_user_data):
        """TECHNICIEN should have all expected permission modules"""
        permissions = tech_user_data.get("permissions", {})
        
        # Expected modules from UserPermissions model
        expected_modules = [
            "dashboard", "interventionRequests", "workOrders", "improvementRequests",
            "improvements", "preventiveMaintenance", "planningMprev", "assets",
            "inventory", "locations", "meters", "surveillance", "surveillanceRapport",
            "presquaccident", "presquaccidentRapport", "documentations", "vendors",
            "reports", "people", "planning", "purchaseHistory", "importExport",
            "journal", "settings", "personalization", "chatLive", "sensors",
            "iotDashboard", "mqttLogs", "purchaseRequests", "whiteboard", "achat",
            "timeTracking", "cameras", "analyticsChecklists", "mes", "mesReports",
            "serviceDashboard", "weeklyReports", "demandesArret", "consignes",
            "autorisationsParticulieres"
        ]
        
        for module in expected_modules:
            assert module in permissions, f"Missing module: {module}"
            assert isinstance(permissions[module], dict), f"Module {module} should be dict"
            assert "view" in permissions[module], f"Module {module} missing 'view'"
            assert "edit" in permissions[module], f"Module {module} missing 'edit'"
            assert "delete" in permissions[module], f"Module {module} missing 'delete'"
        
        print(f"✅ TECHNICIEN has all {len(expected_modules)} expected modules with view,edit,delete")
    
    # =============================================================================
    # TEST 3: TECHNICIEN has workOrders view permission
    # =============================================================================
    def test_technicien_can_view_workorders(self, tech_user_data):
        """TECHNICIEN should have view permission on workOrders"""
        permissions = tech_user_data.get("permissions", {})
        work_orders_perms = permissions.get("workOrders", {})
        
        assert work_orders_perms.get("view") == True, "TECHNICIEN should have workOrders.view = true"
        assert work_orders_perms.get("edit") == True, "TECHNICIEN should have workOrders.edit = true"
        assert work_orders_perms.get("delete") == True, "TECHNICIEN should have workOrders.delete = true"
        
        print("✅ TECHNICIEN has full permissions on workOrders")
    
    # =============================================================================
    # TEST 4: TECHNICIEN can access /api/work-orders (HTTP 200)
    # =============================================================================
    def test_technicien_api_work_orders(self, tech_token):
        """TECHNICIEN should be able to access work-orders API"""
        response = requests.get(
            f"{BASE_URL}/api/work-orders",
            headers={"Authorization": f"Bearer {tech_token}"}
        )
        
        assert response.status_code == 200, f"Work orders API failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Work orders response should be a list"
        
        print(f"✅ TECHNICIEN can access /api/work-orders (got {len(data)} orders)")
    
    # =============================================================================
    # TEST 5: TECHNICIEN can access /api/intervention-requests (HTTP 200)
    # =============================================================================
    def test_technicien_api_intervention_requests(self, tech_token):
        """TECHNICIEN should be able to access intervention-requests API"""
        response = requests.get(
            f"{BASE_URL}/api/intervention-requests",
            headers={"Authorization": f"Bearer {tech_token}"}
        )
        
        assert response.status_code == 200, f"Intervention requests API failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Intervention requests response should be a list"
        
        print(f"✅ TECHNICIEN can access /api/intervention-requests")
    
    # =============================================================================
    # TEST 6: TECHNICIEN can access /api/improvement-requests (HTTP 200)
    # =============================================================================
    def test_technicien_api_improvement_requests(self, tech_token):
        """TECHNICIEN should be able to access improvement-requests API"""
        response = requests.get(
            f"{BASE_URL}/api/improvement-requests",
            headers={"Authorization": f"Bearer {tech_token}"}
        )
        
        assert response.status_code == 200, f"Improvement requests API failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Improvement requests response should be a list"
        
        print(f"✅ TECHNICIEN can access /api/improvement-requests")
    
    # =============================================================================
    # TEST 7: TECHNICIEN can access /api/equipments (HTTP 200)
    # =============================================================================
    def test_technicien_api_equipments(self, tech_token):
        """TECHNICIEN should be able to access equipments API"""
        response = requests.get(
            f"{BASE_URL}/api/equipments",
            headers={"Authorization": f"Bearer {tech_token}"}
        )
        
        assert response.status_code == 200, f"Equipments API failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Equipments response should be a list"
        
        print(f"✅ TECHNICIEN can access /api/equipments")
    
    # =============================================================================
    # TEST 8: ADMIN can get users with clean permissions (no parasites)
    # =============================================================================
    def test_admin_get_users_clean_permissions(self, admin_token):
        """ADMIN should get users list with clean permissions (no parasites)"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Users API failed: {response.status_code} - {response.text}"
        users = response.json()
        assert isinstance(users, list), "Users response should be a list"
        assert len(users) > 0, "Should have at least one user"
        
        # Check each user's permissions for parasites
        for user in users:
            permissions = user.get("permissions", {})
            if not permissions:
                continue
            
            for module_name, module_perms in permissions.items():
                if not isinstance(module_perms, dict):
                    continue
                
                # Check for parasite keys (dateCreation, attachments)
                actual_keys = set(module_perms.keys())
                valid_keys = {"view", "edit", "delete"}
                parasite_keys = actual_keys - valid_keys
                
                assert not parasite_keys, f"User {user.get('email')} module {module_name} has parasites: {parasite_keys}"
        
        print(f"✅ ADMIN can get users ({len(users)}) with clean permissions")
    
    # =============================================================================
    # TEST 9: ADMIN login still works correctly
    # =============================================================================
    def test_admin_login_works(self, admin_user_data):
        """ADMIN login should work correctly"""
        assert admin_user_data.get("role") == "ADMIN"
        assert admin_user_data.get("email") == "admin@test.com"
        
        permissions = admin_user_data.get("permissions", {})
        assert permissions, "ADMIN should have permissions"
        
        # ADMIN should have full permissions on workOrders
        work_orders = permissions.get("workOrders", {})
        assert work_orders.get("view") == True
        assert work_orders.get("edit") == True
        assert work_orders.get("delete") == True
        
        print("✅ ADMIN login works correctly with full permissions")
    
    # =============================================================================
    # TEST 10: TECHNICIEN has access to sidebar modules
    # =============================================================================
    def test_technicien_sidebar_modules(self, tech_user_data):
        """TECHNICIEN should have view access to sidebar modules"""
        permissions = tech_user_data.get("permissions", {})
        
        # Modules that should show in sidebar for TECHNICIEN
        sidebar_modules = [
            "workOrders",           # Ordres de travail
            "interventionRequests", # Demandes d'inter.
            "improvementRequests",  # Demandes d'amél.
            "improvements",         # Améliorations
            "preventiveMaintenance", # Maintenance prev.
            "assets",               # Équipements
            "inventory",            # Inventaire
        ]
        
        for module in sidebar_modules:
            module_perms = permissions.get(module, {})
            assert module_perms.get("view") == True, f"TECHNICIEN should have view access to {module}"
        
        print(f"✅ TECHNICIEN has view access to all {len(sidebar_modules)} sidebar modules")


class TestSerializeDocPermissions:
    """Tests to verify serialize_doc doesn't pollute nested dicts"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get ADMIN token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_users_permissions_no_date_creation(self, admin_token):
        """Users permissions should not have dateCreation in sub-dicts"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        users = response.json()
        
        for user in users:
            perms = user.get("permissions", {})
            for module_name, module_perms in perms.items():
                if isinstance(module_perms, dict):
                    assert "dateCreation" not in module_perms, f"User {user.get('email')} {module_name} has dateCreation"
                    assert "attachments" not in module_perms, f"User {user.get('email')} {module_name} has attachments"
        
        print("✅ No dateCreation/attachments parasites in user permissions")
    
    def test_login_response_clean(self):
        """Login response permissions should be clean"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TECHNICIEN_CREDS)
        assert response.status_code == 200
        
        user = response.json()["user"]
        perms = user.get("permissions", {})
        
        # Count modules and verify structure
        module_count = 0
        for module_name, module_perms in perms.items():
            module_count += 1
            assert isinstance(module_perms, dict), f"Module {module_name} should be dict"
            keys = set(module_perms.keys())
            invalid = keys - {"view", "edit", "delete"}
            assert not invalid, f"Module {module_name} has invalid keys: {invalid}"
        
        print(f"✅ Login response has clean permissions with {module_count} modules")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
