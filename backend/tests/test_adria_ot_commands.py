"""
Tests for Adria AI Assistant OT Commands (CREATE_OT fix and MODIFY_OT new feature)
- Verifies POST /api/work-orders correctly saves equipement_id and priorite
- Verifies PUT /api/work-orders/{id} correctly updates priorite, equipement_id, statut, categorie
- Tests equipment name resolution flow (simulating frontend behavior)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://date-sort-demo.preview.emergentagent.com')
if BASE_URL.endswith('/'):
    BASE_URL = BASE_URL.rstrip('/')


class TestAdriaOTCommands:
    """Test suite for Adria AI CREATE_OT fix and MODIFY_OT new feature"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login as admin and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin123!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def equipments(self, auth_headers):
        """Get list of equipments for testing"""
        response = requests.get(f"{BASE_URL}/api/equipments", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get equipments: {response.text}"
        return response.json()
    
    # ==================== POST /api/work-orders Tests ====================
    
    def test_create_wo_with_equipement_id_and_priorite(self, auth_headers, equipments):
        """Test CREATE_OT fix: Verify equipement_id and priorite are saved correctly"""
        # Get first equipment ID
        assert len(equipments) > 0, "No equipments found for testing"
        equipment_id = equipments[0]["id"]
        equipment_nom = equipments[0]["nom"]
        
        # Create work order with equipement_id and priorite
        payload = {
            "titre": "TEST_ADRIA_CREATE_OT_FIX",
            "description": f"Test création via Adria avec équipement: {equipment_nom}",
            "priorite": "URGENTE",
            "statut": "OUVERT",
            "equipement_id": equipment_id
        }
        
        response = requests.post(f"{BASE_URL}/api/work-orders", headers=auth_headers, json=payload)
        assert response.status_code == 200, f"Create WO failed: {response.text}"
        
        data = response.json()
        
        # Verify equipement_id is saved
        assert data.get("equipement_id") == equipment_id, \
            f"equipement_id not saved correctly. Expected: {equipment_id}, Got: {data.get('equipement_id')}"
        
        # Verify priorite is saved
        assert data.get("priorite") == "URGENTE", \
            f"priorite not saved correctly. Expected: URGENTE, Got: {data.get('priorite')}"
        
        # Verify equipement object is populated
        assert data.get("equipement") is not None, "equipement object not populated"
        assert data["equipement"]["id"] == equipment_id, "equipement.id doesn't match"
        assert data["equipement"]["nom"] == equipment_nom, "equipement.nom doesn't match"
        
        print(f"✅ CREATE_OT fix verified: WO #{data['numero']} created with equipment '{equipment_nom}' and priority URGENTE")
        
        return data["id"]  # Return ID for cleanup
    
    def test_create_wo_with_all_priorities(self, auth_headers, equipments):
        """Test that all priority values are accepted"""
        equipment_id = equipments[0]["id"] if equipments else None
        priorities = ["URGENTE", "HAUTE", "MOYENNE", "NORMALE", "BASSE"]
        
        for priorite in priorities:
            payload = {
                "titre": f"TEST_PRIORITY_{priorite}",
                "description": f"Test priorité {priorite}",
                "priorite": priorite,
                "statut": "OUVERT",
                "equipement_id": equipment_id
            }
            
            response = requests.post(f"{BASE_URL}/api/work-orders", headers=auth_headers, json=payload)
            assert response.status_code == 200, f"Create WO with priority {priorite} failed: {response.text}"
            
            data = response.json()
            assert data.get("priorite") == priorite, f"Priority {priorite} not saved correctly"
            print(f"✅ Priority {priorite} saved correctly")
    
    def test_create_wo_with_categorie(self, auth_headers):
        """Test that categorie field is saved correctly"""
        categories = ["TRAVAUX_CURATIF", "TRAVAUX_PREVENTIFS", "TRAVAUX_DIVERS", "CHANGEMENT_FORMAT", "FORMATION", "REGLAGE"]
        
        for categorie in categories:
            payload = {
                "titre": f"TEST_CATEGORIE_{categorie}",
                "description": f"Test catégorie {categorie}",
                "priorite": "NORMALE",
                "statut": "OUVERT",
                "categorie": categorie
            }
            
            response = requests.post(f"{BASE_URL}/api/work-orders", headers=auth_headers, json=payload)
            assert response.status_code == 200, f"Create WO with categorie {categorie} failed: {response.text}"
            
            data = response.json()
            assert data.get("categorie") == categorie, f"Categorie {categorie} not saved correctly"
            print(f"✅ Categorie {categorie} saved correctly")
    
    # ==================== PUT /api/work-orders/{id} Tests ====================
    
    def test_modify_wo_priorite(self, auth_headers, equipments):
        """Test MODIFY_OT: Update priority only"""
        # First create a WO
        create_payload = {
            "titre": "TEST_MODIFY_PRIORITY",
            "description": "Test modification priorité",
            "priorite": "BASSE",
            "statut": "OUVERT"
        }
        create_response = requests.post(f"{BASE_URL}/api/work-orders", headers=auth_headers, json=create_payload)
        assert create_response.status_code == 200
        wo_id = create_response.json()["id"]
        
        # Update priority
        update_payload = {"priorite": "URGENTE"}
        update_response = requests.put(f"{BASE_URL}/api/work-orders/{wo_id}", headers=auth_headers, json=update_payload)
        assert update_response.status_code == 200, f"Update priority failed: {update_response.text}"
        
        data = update_response.json()
        assert data.get("priorite") == "URGENTE", f"Priority not updated. Got: {data.get('priorite')}"
        print(f"✅ MODIFY_OT priority: BASSE -> URGENTE works correctly")
    
    def test_modify_wo_statut(self, auth_headers):
        """Test MODIFY_OT: Update status only"""
        # Create a WO
        create_payload = {
            "titre": "TEST_MODIFY_STATUS",
            "description": "Test modification statut",
            "priorite": "NORMALE",
            "statut": "OUVERT"
        }
        create_response = requests.post(f"{BASE_URL}/api/work-orders", headers=auth_headers, json=create_payload)
        assert create_response.status_code == 200
        wo_id = create_response.json()["id"]
        
        # Update status to EN_COURS
        update_payload = {"statut": "EN_COURS"}
        update_response = requests.put(f"{BASE_URL}/api/work-orders/{wo_id}", headers=auth_headers, json=update_payload)
        assert update_response.status_code == 200, f"Update status failed: {update_response.text}"
        
        data = update_response.json()
        assert data.get("statut") == "EN_COURS", f"Status not updated. Got: {data.get('statut')}"
        print(f"✅ MODIFY_OT status: OUVERT -> EN_COURS works correctly")
    
    def test_modify_wo_equipement_id(self, auth_headers, equipments):
        """Test MODIFY_OT: Update equipement_id"""
        assert len(equipments) >= 2, "Need at least 2 equipments for this test"
        eq1_id = equipments[0]["id"]
        eq2_id = equipments[1]["id"]
        eq2_nom = equipments[1]["nom"]
        
        # Create a WO with first equipment
        create_payload = {
            "titre": "TEST_MODIFY_EQUIPMENT",
            "description": "Test modification équipement",
            "priorite": "NORMALE",
            "statut": "OUVERT",
            "equipement_id": eq1_id
        }
        create_response = requests.post(f"{BASE_URL}/api/work-orders", headers=auth_headers, json=create_payload)
        assert create_response.status_code == 200
        wo_id = create_response.json()["id"]
        
        # Update to second equipment
        update_payload = {"equipement_id": eq2_id}
        update_response = requests.put(f"{BASE_URL}/api/work-orders/{wo_id}", headers=auth_headers, json=update_payload)
        assert update_response.status_code == 200, f"Update equipment failed: {update_response.text}"
        
        data = update_response.json()
        assert data.get("equipement_id") == eq2_id, f"equipement_id not updated. Got: {data.get('equipement_id')}"
        assert data.get("equipement", {}).get("nom") == eq2_nom, "equipement object not updated correctly"
        print(f"✅ MODIFY_OT equipement_id: Changed to '{eq2_nom}' works correctly")
    
    def test_modify_wo_multiple_fields(self, auth_headers, equipments):
        """Test MODIFY_OT: Update multiple fields at once"""
        eq_id = equipments[0]["id"] if equipments else None
        
        # Create a WO
        create_payload = {
            "titre": "TEST_MODIFY_MULTIPLE",
            "description": "Test modification multiple",
            "priorite": "BASSE",
            "statut": "OUVERT"
        }
        create_response = requests.post(f"{BASE_URL}/api/work-orders", headers=auth_headers, json=create_payload)
        assert create_response.status_code == 200
        wo_id = create_response.json()["id"]
        
        # Update multiple fields
        update_payload = {
            "priorite": "HAUTE",
            "statut": "EN_COURS",
            "categorie": "TRAVAUX_CURATIF",
            "equipement_id": eq_id
        }
        update_response = requests.put(f"{BASE_URL}/api/work-orders/{wo_id}", headers=auth_headers, json=update_payload)
        assert update_response.status_code == 200, f"Update multiple fields failed: {update_response.text}"
        
        data = update_response.json()
        assert data.get("priorite") == "HAUTE", "priorite not updated"
        assert data.get("statut") == "EN_COURS", "statut not updated"
        assert data.get("categorie") == "TRAVAUX_CURATIF", "categorie not updated"
        if eq_id:
            assert data.get("equipement_id") == eq_id, "equipement_id not updated"
        
        print(f"✅ MODIFY_OT multiple fields: All updates work correctly")
    
    # ==================== Equipment Name Resolution Simulation ====================
    
    def test_equipment_name_resolution_flow(self, auth_headers, equipments):
        """
        Simulate the frontend flow: resolve equipment name to ID then create WO
        This is what the AIChatWidget.jsx CREATE_OT handler does
        """
        # Simulate searching for equipment by name
        search_name = "bioci"  # Partial match
        matched_equipment = None
        
        for eq in equipments:
            if search_name.lower() in eq.get("nom", "").lower() or \
               search_name.lower() in eq.get("reference", "").lower():
                matched_equipment = eq
                break
        
        assert matched_equipment is not None, f"No equipment found matching '{search_name}'"
        print(f"✅ Equipment resolution: '{search_name}' -> '{matched_equipment['nom']}' (ID: {matched_equipment['id']})")
        
        # Now create WO with resolved ID (simulating frontend behavior)
        payload = {
            "titre": f"TEST_RESOLUTION_FLOW_{search_name}",
            "description": f"Test résolution équipement: {search_name}\nEquipement: {matched_equipment['nom']}",
            "priorite": "URGENTE",
            "statut": "OUVERT",
            "equipement_id": matched_equipment["id"]
        }
        
        response = requests.post(f"{BASE_URL}/api/work-orders", headers=auth_headers, json=payload)
        assert response.status_code == 200, f"Create WO after resolution failed: {response.text}"
        
        data = response.json()
        assert data.get("equipement_id") == matched_equipment["id"], "equipement_id not saved after resolution"
        print(f"✅ Full resolution flow works: Created WO #{data['numero']} with resolved equipment")
    
    # ==================== Cleanup ====================
    
    @pytest.fixture(scope="class", autouse=True)
    def cleanup_test_data(self, auth_headers):
        """Cleanup TEST_ prefixed work orders after all tests"""
        yield  # Run tests first
        
        # Delete all test-created work orders
        try:
            response = requests.get(f"{BASE_URL}/api/work-orders", headers=auth_headers)
            if response.status_code == 200:
                work_orders = response.json()
                test_wos = [wo for wo in work_orders if wo.get("titre", "").startswith("TEST_")]
                for wo in test_wos:
                    requests.delete(f"{BASE_URL}/api/work-orders/{wo['id']}", headers=auth_headers)
                print(f"🧹 Cleanup: Deleted {len(test_wos)} test work orders")
        except Exception as e:
            print(f"⚠️ Cleanup warning: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
