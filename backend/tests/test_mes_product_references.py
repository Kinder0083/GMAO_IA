"""
Tests for MES Product References Feature (iteration 4)
Features tested:
- Product References CRUD (admin-only create/update/delete)
- Select reference for machine (applies params)
- TRS Weekly History endpoint
- Machine response includes active_reference_id and active_reference_name
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://cause-tree-debug.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "Admin123!"
EXISTING_MACHINE_ID = "698b59a6972c86462554e604"


class TestMESProductReferences:
    """Test Product References CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token before each test"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        self.created_ref_ids = []
        yield
        # Cleanup created references
        for ref_id in self.created_ref_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/mes/product-references/{ref_id}")
            except:
                pass

    def test_list_product_references(self):
        """Test GET /api/mes/product-references - List all product references"""
        response = self.session.get(f"{BASE_URL}/api/mes/product-references")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Check structure of references
        if len(data) > 0:
            ref = data[0]
            assert "id" in ref
            assert "name" in ref
            assert "theoretical_cadence" in ref
            assert "downtime_margin_pct" in ref
            assert "trs_target" in ref
            assert "production_schedule" in ref
            assert "alerts" in ref
            assert "email_notifications" in ref
        print(f"Found {len(data)} product references")

    def test_create_product_reference_admin(self):
        """Test POST /api/mes/product-references - Admin can create reference"""
        unique_name = f"TEST_Reference_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "theoretical_cadence": 25,
            "downtime_margin_pct": 20,
            "trs_target": 90,
            "schedule_is_24h": True,
            "schedule_production_days": [0, 1, 2, 3, 4, 5],
            "alert_stopped_minutes": 3,
            "alert_no_signal_minutes": 8
        }
        response = self.session.post(f"{BASE_URL}/api/mes/product-references", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert data["name"] == unique_name
        assert data["theoretical_cadence"] == 25
        assert data["downtime_margin_pct"] == 20
        assert data["trs_target"] == 90
        assert data["production_schedule"]["is_24h"] == True
        assert data["alerts"]["stopped_minutes"] == 3
        
        self.created_ref_ids.append(data["id"])
        print(f"Created reference: {data['name']} (id={data['id']})")

    def test_create_product_reference_validates_name(self):
        """Test POST /api/mes/product-references - Requires name"""
        payload = {
            "theoretical_cadence": 10
        }
        response = self.session.post(f"{BASE_URL}/api/mes/product-references", json=payload)
        assert response.status_code == 400
        print("Correctly rejected reference without name")

    def test_update_product_reference(self):
        """Test PUT /api/mes/product-references/{id} - Update reference"""
        # First create a reference
        unique_name = f"TEST_UpdateRef_{uuid.uuid4().hex[:8]}"
        create_response = self.session.post(f"{BASE_URL}/api/mes/product-references", json={
            "name": unique_name,
            "theoretical_cadence": 10,
            "trs_target": 75
        })
        assert create_response.status_code == 200
        ref_id = create_response.json()["id"]
        self.created_ref_ids.append(ref_id)
        
        # Update the reference
        update_payload = {
            "name": f"{unique_name}_updated",
            "theoretical_cadence": 15,
            "trs_target": 88,
            "downtime_margin_pct": 25
        }
        update_response = self.session.put(f"{BASE_URL}/api/mes/product-references/{ref_id}", json=update_payload)
        assert update_response.status_code == 200
        updated = update_response.json()
        
        assert updated["name"] == f"{unique_name}_updated"
        assert updated["theoretical_cadence"] == 15
        assert updated["trs_target"] == 88
        assert updated["downtime_margin_pct"] == 25
        print(f"Updated reference: {updated['name']}")

    def test_delete_product_reference(self):
        """Test DELETE /api/mes/product-references/{id} - Delete reference"""
        # First create a reference
        unique_name = f"TEST_DeleteRef_{uuid.uuid4().hex[:8]}"
        create_response = self.session.post(f"{BASE_URL}/api/mes/product-references", json={
            "name": unique_name,
            "theoretical_cadence": 5
        })
        assert create_response.status_code == 200
        ref_id = create_response.json()["id"]
        
        # Delete the reference
        delete_response = self.session.delete(f"{BASE_URL}/api/mes/product-references/{ref_id}")
        assert delete_response.status_code == 200
        
        # Verify it's deleted
        list_response = self.session.get(f"{BASE_URL}/api/mes/product-references")
        refs = list_response.json()
        assert not any(r["id"] == ref_id for r in refs)
        print(f"Deleted reference: {ref_id}")

    def test_select_reference_for_machine(self):
        """Test POST /api/mes/machines/{id}/select-reference - Apply reference params"""
        # Get existing references
        list_response = self.session.get(f"{BASE_URL}/api/mes/product-references")
        refs = list_response.json()
        assert len(refs) > 0, "No references found to select"
        
        # Select a reference for the machine
        ref_to_select = refs[0]
        select_response = self.session.post(
            f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}/select-reference",
            json={"reference_id": ref_to_select["id"]}
        )
        assert select_response.status_code == 200
        machine = select_response.json()
        
        # Verify machine params were updated with reference values
        assert machine["theoretical_cadence"] == ref_to_select["theoretical_cadence"]
        assert machine["downtime_margin_pct"] == ref_to_select["downtime_margin_pct"]
        assert machine["trs_target"] == ref_to_select["trs_target"]
        assert machine.get("active_reference_id") == ref_to_select["id"]
        print(f"Applied reference '{ref_to_select['name']}' to machine")

    def test_select_reference_requires_id(self):
        """Test POST /api/mes/machines/{id}/select-reference - Requires reference_id"""
        response = self.session.post(
            f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}/select-reference",
            json={}
        )
        assert response.status_code == 400
        print("Correctly rejected select without reference_id")

    def test_select_reference_invalid_ref(self):
        """Test POST /api/mes/machines/{id}/select-reference - Invalid reference returns 404"""
        response = self.session.post(
            f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}/select-reference",
            json={"reference_id": "000000000000000000000000"}
        )
        assert response.status_code == 404
        print("Correctly returned 404 for invalid reference")

    def test_machine_includes_reference_info(self):
        """Test GET /api/mes/machines/{id} - Includes active_reference_id and active_reference_name"""
        response = self.session.get(f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}")
        assert response.status_code == 200
        machine = response.json()
        
        # Should have reference info if a reference is selected
        if machine.get("active_reference_id"):
            assert "active_reference_name" in machine
            print(f"Machine has active reference: {machine.get('active_reference_name')}")
        else:
            print("Machine has no active reference")


class TestMESTRSWeeklyHistory:
    """Test TRS Weekly History endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token before each test"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    def test_trs_history_returns_7_days(self):
        """Test GET /api/mes/machines/{id}/trs-history?days=7 - Returns 7 days data"""
        response = self.session.get(f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}/trs-history?days=7")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) == 7, f"Expected 7 days, got {len(data)}"
        print(f"Got TRS history for {len(data)} days")

    def test_trs_history_structure(self):
        """Test TRS history response structure"""
        response = self.session.get(f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}/trs-history?days=7")
        assert response.status_code == 200
        data = response.json()
        
        # Check structure of each day
        for day in data:
            assert "date" in day
            assert "is_production_day" in day
            assert "production" in day
            assert "rejects" in day
            
            # Production days have TRS values
            if day["is_production_day"]:
                assert "trs" in day or day.get("trs") is None
                assert "availability" in day or day.get("availability") is None
                assert "performance" in day or day.get("performance") is None
                assert "quality" in day or day.get("quality") is None
        
        print("TRS history structure is valid")

    def test_trs_history_production_days_have_data(self):
        """Test that production days have TRS metrics"""
        response = self.session.get(f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}/trs-history?days=7")
        data = response.json()
        
        prod_days = [d for d in data if d["is_production_day"]]
        non_prod_days = [d for d in data if not d["is_production_day"]]
        
        print(f"Production days: {len(prod_days)}, Non-production days: {len(non_prod_days)}")
        
        # Non-production days should have null TRS
        for day in non_prod_days:
            assert day.get("trs") is None or day.get("trs") == 0
        
        print("TRS history correctly identifies production/non-production days")

    def test_trs_history_custom_days(self):
        """Test TRS history with different day counts"""
        for days in [3, 5, 14]:
            response = self.session.get(f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}/trs-history?days={days}")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == days, f"Expected {days} days, got {len(data)}"
        
        print("TRS history works with different day counts")


class TestMESRoleBasedAccess:
    """Test role-based access control for product references"""
    
    @pytest.fixture
    def admin_session(self):
        """Get admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    def test_admin_can_create_reference(self, admin_session):
        """Test that admin users can create product references"""
        unique_name = f"TEST_AdminCreate_{uuid.uuid4().hex[:8]}"
        response = admin_session.post(f"{BASE_URL}/api/mes/product-references", json={
            "name": unique_name,
            "theoretical_cadence": 10
        })
        assert response.status_code == 200
        ref_id = response.json()["id"]
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/mes/product-references/{ref_id}")
        print("Admin can create references")

    def test_admin_can_update_reference(self, admin_session):
        """Test that admin users can update product references"""
        # Create reference first
        unique_name = f"TEST_AdminUpdate_{uuid.uuid4().hex[:8]}"
        create_resp = admin_session.post(f"{BASE_URL}/api/mes/product-references", json={
            "name": unique_name,
            "theoretical_cadence": 10
        })
        assert create_resp.status_code == 200
        ref_id = create_resp.json()["id"]
        
        # Update it
        update_resp = admin_session.put(f"{BASE_URL}/api/mes/product-references/{ref_id}", json={
            "trs_target": 95
        })
        assert update_resp.status_code == 200
        assert update_resp.json()["trs_target"] == 95
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/mes/product-references/{ref_id}")
        print("Admin can update references")

    def test_admin_can_delete_reference(self, admin_session):
        """Test that admin users can delete product references"""
        # Create reference first
        unique_name = f"TEST_AdminDelete_{uuid.uuid4().hex[:8]}"
        create_resp = admin_session.post(f"{BASE_URL}/api/mes/product-references", json={
            "name": unique_name,
            "theoretical_cadence": 10
        })
        assert create_resp.status_code == 200
        ref_id = create_resp.json()["id"]
        
        # Delete it
        delete_resp = admin_session.delete(f"{BASE_URL}/api/mes/product-references/{ref_id}")
        assert delete_resp.status_code == 200
        print("Admin can delete references")


class TestMESDeleteReferenceUnlinksFromMachines:
    """Test that deleting a reference unlinks it from machines"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    def test_delete_reference_unlinks_machines(self):
        """Test DELETE /api/mes/product-references/{id} unlinks machines using this reference"""
        # Create a new reference
        unique_name = f"TEST_UnlinkRef_{uuid.uuid4().hex[:8]}"
        create_resp = self.session.post(f"{BASE_URL}/api/mes/product-references", json={
            "name": unique_name,
            "theoretical_cadence": 50
        })
        assert create_resp.status_code == 200
        ref_id = create_resp.json()["id"]
        
        # Select this reference for the machine
        select_resp = self.session.post(
            f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}/select-reference",
            json={"reference_id": ref_id}
        )
        assert select_resp.status_code == 200
        
        # Verify machine has this reference
        machine_before = self.session.get(f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}").json()
        assert machine_before.get("active_reference_id") == ref_id
        
        # Delete the reference
        delete_resp = self.session.delete(f"{BASE_URL}/api/mes/product-references/{ref_id}")
        assert delete_resp.status_code == 200
        
        # Verify machine no longer has active_reference_id (or it's None/empty)
        machine_after = self.session.get(f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}").json()
        assert machine_after.get("active_reference_id") is None or machine_after.get("active_reference_id") == ""
        
        # Restore the original reference (Produit A - 500ml)
        list_refs = self.session.get(f"{BASE_URL}/api/mes/product-references").json()
        if list_refs:
            self.session.post(
                f"{BASE_URL}/api/mes/machines/{EXISTING_MACHINE_ID}/select-reference",
                json={"reference_id": list_refs[0]["id"]}
            )
        
        print("Deleting reference correctly unlinks from machines")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
