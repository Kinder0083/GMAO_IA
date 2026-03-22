"""
Regression tests for Adria AI assistant after refactoring (iteration 47)
Tests: CREATE_OT, MODIFY_OT, CLOSE_OT, manual sections, API endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://cmms-assignee-fix.preview.emergentagent.com').rstrip('/')

class TestSetup:
    """Setup fixtures for all tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Return headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestManualSections(TestSetup):
    """Verify manual sections sec-024-11, sec-024-12, sec-024-13 exist"""
    
    def test_manual_content_endpoint(self, headers):
        """GET /api/manual/content should return sections"""
        response = requests.get(f"{BASE_URL}/api/manual/content", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "chapters" in data
        assert "sections" in data
        print(f"Total chapters: {len(data['chapters'])}, sections: {len(data['sections'])}")
    
    def test_sec_024_11_exists(self, headers):
        """sec-024-11 (Modifier un OT via Adria) should exist"""
        response = requests.get(f"{BASE_URL}/api/manual/content", headers=headers)
        data = response.json()
        sec_024_11 = [s for s in data.get('sections', []) if s.get('id') == 'sec-024-11']
        assert len(sec_024_11) == 1, "sec-024-11 not found"
        assert "Modifier" in sec_024_11[0].get('title', ''), f"Title mismatch: {sec_024_11[0].get('title')}"
        print(f"✅ sec-024-11: {sec_024_11[0].get('title')}")
    
    def test_sec_024_12_exists(self, headers):
        """sec-024-12 (Cloturer un OT via Adria) should exist"""
        response = requests.get(f"{BASE_URL}/api/manual/content", headers=headers)
        data = response.json()
        sec_024_12 = [s for s in data.get('sections', []) if s.get('id') == 'sec-024-12']
        assert len(sec_024_12) == 1, "sec-024-12 not found"
        assert "Cloturer" in sec_024_12[0].get('title', '') or "Cloture" in sec_024_12[0].get('title', ''), f"Title mismatch: {sec_024_12[0].get('title')}"
        print(f"✅ sec-024-12: {sec_024_12[0].get('title')}")
    
    def test_sec_024_13_exists(self, headers):
        """sec-024-13 (Assignation de technicien via Adria) should exist"""
        response = requests.get(f"{BASE_URL}/api/manual/content", headers=headers)
        data = response.json()
        sec_024_13 = [s for s in data.get('sections', []) if s.get('id') == 'sec-024-13']
        assert len(sec_024_13) == 1, "sec-024-13 not found"
        assert "Assign" in sec_024_13[0].get('title', ''), f"Title mismatch: {sec_024_13[0].get('title')}"
        print(f"✅ sec-024-13: {sec_024_13[0].get('title')}")
    
    def test_ch_024_has_new_sections(self, headers):
        """Chapter ch-024 should contain the 3 new sections"""
        response = requests.get(f"{BASE_URL}/api/manual/content", headers=headers)
        data = response.json()
        ch024_sections = [s for s in data.get('sections', []) if s.get('chapter_id') == 'ch-024']
        section_ids = [s.get('id') for s in ch024_sections]
        assert 'sec-024-11' in section_ids, "sec-024-11 not in ch-024"
        assert 'sec-024-12' in section_ids, "sec-024-12 not in ch-024"
        assert 'sec-024-13' in section_ids, "sec-024-13 not in ch-024"
        print(f"✅ ch-024 has {len(ch024_sections)} sections including the 3 new ones")


class TestCRUDWorkOrders(TestSetup):
    """Test CREATE, MODIFY, CLOSE OT flows via API"""
    
    @pytest.fixture
    def test_ot_id(self, headers):
        """Create a test OT and return its ID, cleanup after test"""
        # Create
        ot_data = {
            "titre": "TEST_REFACTOR_OT",
            "description": "Test OT for refactoring regression",
            "priorite": "NORMALE",
            "statut": "OUVERT",
            "equipement_id": "69706f4ce0eb4fc8238e15d9"  # Bioci 1
        }
        response = requests.post(f"{BASE_URL}/api/work-orders", headers=headers, json=ot_data)
        assert response.status_code == 200, f"Failed to create OT: {response.text}"
        ot_id = response.json().get("id")
        yield ot_id
        # Cleanup
        requests.delete(f"{BASE_URL}/api/work-orders/{ot_id}", headers=headers)
    
    def test_create_ot_with_equipment(self, headers):
        """CREATE_OT: Create OT with equipment_id should populate equipement"""
        ot_data = {
            "titre": "TEST_CREATE_OT_EQUIP",
            "description": "Testing equipment resolution",
            "priorite": "URGENTE",
            "statut": "OUVERT",
            "equipement_id": "69706f4ce0eb4fc8238e15d9"
        }
        response = requests.post(f"{BASE_URL}/api/work-orders", headers=headers, json=ot_data)
        assert response.status_code == 200
        data = response.json()
        assert data.get("equipement_id") == "69706f4ce0eb4fc8238e15d9"
        assert data.get("priorite") == "URGENTE"
        print(f"✅ CREATE_OT: Created OT with ID {data.get('id')[-8:]}, equipment resolved")
        
        # Verify GET returns populated equipment
        get_response = requests.get(f"{BASE_URL}/api/work-orders/{data.get('id')}", headers=headers)
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data.get("equipement", {}).get("nom") == "Bioci 1"
        print(f"✅ GET OT: Equipment populated as 'Bioci 1'")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/work-orders/{data.get('id')}", headers=headers)
    
    def test_modify_ot_priority(self, headers, test_ot_id):
        """MODIFY_OT: Change priority should persist"""
        update_data = {"priorite": "HAUTE"}
        response = requests.put(f"{BASE_URL}/api/work-orders/{test_ot_id}", headers=headers, json=update_data)
        assert response.status_code == 200
        
        # Verify change persisted
        get_response = requests.get(f"{BASE_URL}/api/work-orders/{test_ot_id}", headers=headers)
        assert get_response.status_code == 200
        assert get_response.json().get("priorite") == "HAUTE"
        print(f"✅ MODIFY_OT: Priority changed to HAUTE")
    
    def test_modify_ot_assigne_a(self, headers, test_ot_id):
        """MODIFY_OT: Assign technician via assigne_a_id"""
        update_data = {"assigne_a_id": "69707030e0eb4fc8238e15dd"}  # Axel dupont
        response = requests.put(f"{BASE_URL}/api/work-orders/{test_ot_id}", headers=headers, json=update_data)
        assert response.status_code == 200
        
        # Verify assigneA populated
        get_response = requests.get(f"{BASE_URL}/api/work-orders/{test_ot_id}", headers=headers)
        assert get_response.status_code == 200
        data = get_response.json()
        assert data.get("assigne_a_id") == "69707030e0eb4fc8238e15dd"
        assert data.get("assigneA", {}).get("prenom") == "Axel"
        print(f"✅ MODIFY_OT: Technician assigned (Axel dupont)")
    
    def test_close_ot_workflow(self, headers):
        """CLOSE_OT: Full close workflow - add time, comment, set TERMINE"""
        # Create test OT
        ot_data = {
            "titre": "TEST_CLOSE_OT", 
            "description": "Test close OT workflow",
            "priorite": "NORMALE", 
            "statut": "OUVERT"
        }
        create_resp = requests.post(f"{BASE_URL}/api/work-orders", headers=headers, json=ot_data)
        assert create_resp.status_code == 200
        ot_id = create_resp.json().get("id")
        
        try:
            # 1. Add time
            time_resp = requests.post(f"{BASE_URL}/api/work-orders/{ot_id}/add-time", 
                                      headers=headers, json={"hours": 2, "minutes": 30})
            assert time_resp.status_code == 200
            print(f"✅ CLOSE_OT step 1: Time added (2h30)")
            
            # 2. Add comment with parts
            comment_resp = requests.post(f"{BASE_URL}/api/work-orders/{ot_id}/comments",
                                        headers=headers, json={
                                            "text": "Test closure comment",
                                            "parts_used": [{"custom_part_name": "Test part", "quantity": 1}]
                                        })
            assert comment_resp.status_code == 200
            print(f"✅ CLOSE_OT step 2: Comment with parts added")
            
            # 3. Set status TERMINE
            close_resp = requests.put(f"{BASE_URL}/api/work-orders/{ot_id}", 
                                      headers=headers, json={"statut": "TERMINE"})
            assert close_resp.status_code == 200
            print(f"✅ CLOSE_OT step 3: Status set to TERMINE")
            
            # Verify final state
            get_resp = requests.get(f"{BASE_URL}/api/work-orders/{ot_id}", headers=headers)
            data = get_resp.json()
            assert data.get("statut") == "TERMINE"
            assert data.get("tempsReel") == 2.5  # 2h30 = 2.5 decimal hours
            assert data.get("dateTermine") is not None
            print(f"✅ CLOSE_OT verified: statut=TERMINE, tempsReel=2.5, dateTermine set")
        finally:
            requests.delete(f"{BASE_URL}/api/work-orders/{ot_id}", headers=headers)


class TestAPIEndpoints(TestSetup):
    """Verify critical API endpoints are working"""
    
    def test_ai_chat_endpoint(self, headers):
        """POST /api/ai/chat should respond"""
        response = requests.post(f"{BASE_URL}/api/ai/chat", headers=headers, json={
            "message": "Bonjour",
            "session_id": None,
            "context": "Test"
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert "session_id" in data
        print(f"✅ AI chat endpoint working: {data.get('response')[:50]}...")
    
    def test_equipments_list(self, headers):
        """GET /api/equipments should return list with Bioci 1"""
        response = requests.get(f"{BASE_URL}/api/equipments", headers=headers)
        assert response.status_code == 200
        data = response.json()
        bioci = [e for e in data if e.get('nom') == 'Bioci 1']
        assert len(bioci) > 0, "Bioci 1 equipment not found"
        assert bioci[0].get('id') == '69706f4ce0eb4fc8238e15d9'
        print(f"✅ Equipments API: Found Bioci 1 (id: {bioci[0].get('id')})")
    
    def test_users_list(self, headers):
        """GET /api/users should return list with Axel dupont"""
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        assert response.status_code == 200
        data = response.json()
        axel = [u for u in data if u.get('prenom') == 'Axel']
        assert len(axel) > 0, "Axel dupont user not found"
        assert axel[0].get('id') == '69707030e0eb4fc8238e15dd'
        print(f"✅ Users API: Found Axel dupont (id: {axel[0].get('id')})")
    
    def test_inventory_list(self, headers):
        """GET /api/inventory should return list"""
        response = requests.get(f"{BASE_URL}/api/inventory", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Inventory API: {len(data)} items")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
