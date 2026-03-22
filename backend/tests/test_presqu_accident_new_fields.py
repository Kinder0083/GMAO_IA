"""
Test suite for Presqu'accident new fields (7 rubriques)
Testing:
- categorie_incident (enum type d'incident)
- equipement_id, equipement_nom (lien equipement GMAO)
- mesures_immediates (mesures prises)
- temoins (noms des temoins)
- type_lesion_potentielle (enum type de lesion)
- facteurs_contributifs (multi-select array)
- conditions_incident (texte libre)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pending-reason-track.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@test.com"
TEST_PASSWORD = "Admin123!"

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")

@pytest.fixture(scope="module")
def api_client(auth_token):
    """Session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestPresquAccidentHealthCheck:
    """Basic health checks before testing CRUD"""
    
    def test_api_reachable(self, api_client):
        """Verify API is reachable"""
        response = api_client.get(f"{BASE_URL}/api/health")
        # Health endpoint may return 200 or 404 depending on implementation
        assert response.status_code in [200, 404], f"API unreachable: {response.status_code}"
        print("API reachable: PASS")
    
    def test_get_presqu_accident_items_endpoint(self, api_client):
        """Verify GET /api/presqu-accident/items works"""
        response = api_client.get(f"{BASE_URL}/api/presqu-accident/items")
        assert response.status_code == 200, f"GET items failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"GET items: PASS - {len(data)} items returned")


class TestPresquAccidentCreateWithNewFields:
    """Test creating presqu'accident with all new fields"""
    
    def test_create_with_categorie_incident(self, api_client):
        """Test POST with categorie_incident field"""
        test_id = str(uuid.uuid4())[:8]
        payload = {
            "titre": f"TEST_{test_id}_Categorie Incident Test",
            "description": "Testing categorie incident field",
            "date_incident": "2026-01-15",
            "lieu": "Atelier Test",
            "service": "PRODUCTION",
            "categorie_incident": "CHUTE_PERSONNE"
        }
        response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=payload)
        assert response.status_code == 200, f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("categorie_incident") == "CHUTE_PERSONNE", "categorie_incident not saved"
        print(f"Create with categorie_incident: PASS - ID: {data.get('id')}")
        
        # Store ID for cleanup
        return data.get("id")
    
    def test_create_with_equipement_link(self, api_client):
        """Test POST with equipement_id and equipement_nom"""
        test_id = str(uuid.uuid4())[:8]
        
        # First get an equipment from the database
        eq_response = api_client.get(f"{BASE_URL}/api/equipments")
        equipments = eq_response.json() if eq_response.status_code == 200 else []
        eq_id = equipments[0].get("id") if equipments else "test-eq-id"
        eq_nom = equipments[0].get("nom") if equipments else "Test Equipement"
        
        payload = {
            "titre": f"TEST_{test_id}_Equipement Link Test",
            "description": "Testing equipement link fields",
            "date_incident": "2026-01-15",
            "lieu": "Atelier Equipement",
            "service": "MAINTENANCE",
            "equipement_id": eq_id,
            "equipement_nom": eq_nom
        }
        response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=payload)
        assert response.status_code == 200, f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("equipement_id") == eq_id, "equipement_id not saved"
        assert data.get("equipement_nom") == eq_nom, "equipement_nom not saved"
        print(f"Create with equipement link: PASS - ID: {data.get('id')}")
        
        return data.get("id")
    
    def test_create_with_mesures_immediates(self, api_client):
        """Test POST with mesures_immediates field"""
        test_id = str(uuid.uuid4())[:8]
        payload = {
            "titre": f"TEST_{test_id}_Mesures Immediates Test",
            "description": "Testing mesures immediates field",
            "date_incident": "2026-01-15",
            "lieu": "Zone A",
            "service": "LOGISTIQUE",
            "mesures_immediates": "Zone securisee, acces interdit temporairement"
        }
        response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=payload)
        assert response.status_code == 200, f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("mesures_immediates") == "Zone securisee, acces interdit temporairement", "mesures_immediates not saved"
        print(f"Create with mesures_immediates: PASS - ID: {data.get('id')}")
        
        return data.get("id")
    
    def test_create_with_temoins(self, api_client):
        """Test POST with temoins field"""
        test_id = str(uuid.uuid4())[:8]
        payload = {
            "titre": f"TEST_{test_id}_Temoins Test",
            "description": "Testing temoins field",
            "date_incident": "2026-01-15",
            "lieu": "Entrepot",
            "service": "ADV",
            "temoins": "Jean Dupont, Marie Martin, Paul Bernard"
        }
        response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=payload)
        assert response.status_code == 200, f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("temoins") == "Jean Dupont, Marie Martin, Paul Bernard", "temoins not saved"
        print(f"Create with temoins: PASS - ID: {data.get('id')}")
        
        return data.get("id")
    
    def test_create_with_type_lesion_potentielle(self, api_client):
        """Test POST with type_lesion_potentielle field"""
        test_id = str(uuid.uuid4())[:8]
        payload = {
            "titre": f"TEST_{test_id}_Lesion Potentielle Test",
            "description": "Testing type lesion potentielle field",
            "date_incident": "2026-01-15",
            "lieu": "Atelier B2",
            "service": "PRODUCTION",
            "type_lesion_potentielle": "FRACTURE"
        }
        response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=payload)
        assert response.status_code == 200, f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("type_lesion_potentielle") == "FRACTURE", "type_lesion_potentielle not saved"
        print(f"Create with type_lesion_potentielle: PASS - ID: {data.get('id')}")
        
        return data.get("id")
    
    def test_create_with_facteurs_contributifs(self, api_client):
        """Test POST with facteurs_contributifs multi-select field"""
        test_id = str(uuid.uuid4())[:8]
        payload = {
            "titre": f"TEST_{test_id}_Facteurs Contributifs Test",
            "description": "Testing facteurs contributifs multi-select",
            "date_incident": "2026-01-15",
            "lieu": "Zone Production",
            "service": "QHSE",
            "facteurs_contributifs": ["HUMAIN", "MATERIEL", "ENVIRONNEMENTAL"]
        }
        response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=payload)
        assert response.status_code == 200, f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        facteurs = data.get("facteurs_contributifs", [])
        assert isinstance(facteurs, list), "facteurs_contributifs should be a list"
        assert "HUMAIN" in facteurs, "HUMAIN not in facteurs"
        assert "MATERIEL" in facteurs, "MATERIEL not in facteurs"
        assert "ENVIRONNEMENTAL" in facteurs, "ENVIRONNEMENTAL not in facteurs"
        print(f"Create with facteurs_contributifs: PASS - {len(facteurs)} facteurs saved")
        
        return data.get("id")
    
    def test_create_with_conditions_incident(self, api_client):
        """Test POST with conditions_incident field"""
        test_id = str(uuid.uuid4())[:8]
        payload = {
            "titre": f"TEST_{test_id}_Conditions Incident Test",
            "description": "Testing conditions incident field",
            "date_incident": "2026-01-15",
            "lieu": "Atelier Nuit",
            "service": "INDUS",
            "conditions_incident": "Poste de nuit, sol mouille, forte chaleur, charge de travail elevee"
        }
        response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=payload)
        assert response.status_code == 200, f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "Poste de nuit" in data.get("conditions_incident", ""), "conditions_incident not saved"
        print(f"Create with conditions_incident: PASS - ID: {data.get('id')}")
        
        return data.get("id")
    
    def test_create_with_all_new_fields(self, api_client):
        """Test POST with ALL new fields combined"""
        test_id = str(uuid.uuid4())[:8]
        
        # Get equipment for linking
        eq_response = api_client.get(f"{BASE_URL}/api/equipments")
        equipments = eq_response.json() if eq_response.status_code == 200 else []
        eq_id = equipments[0].get("id") if equipments else None
        eq_nom = equipments[0].get("nom") if equipments else None
        
        payload = {
            "titre": f"TEST_{test_id}_All New Fields Combined",
            "description": "Testing all 7 new fields together",
            "date_incident": "2026-01-15",
            "lieu": "Entrepot Central",
            "service": "LOGISTIQUE",
            "categorie_incident": "COLLISION",
            "equipement_id": eq_id,
            "equipement_nom": eq_nom,
            "mesures_immediates": "Zone balisee, acces restreint, ambulance appelee",
            "temoins": "Pierre Durand, Sophie Bernard",
            "type_lesion_potentielle": "CONTUSION",
            "facteurs_contributifs": ["HUMAIN", "ORGANISATIONNEL"],
            "conditions_incident": "Fin de journee, forte affluence, signalisation degradee",
            "declarant": "Test Admin",
            "personnes_impliquees": "Employe Test",
            "contexte_cause": "Croisement de chariots mal signalise",
            "severite": "ELEVE",
            "actions_proposees": "Renforcer la signalisation et former le personnel"
        }
        response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=payload)
        assert response.status_code == 200, f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Verify all new fields are saved
        assert data.get("categorie_incident") == "COLLISION", "categorie_incident not saved"
        assert data.get("mesures_immediates") == "Zone balisee, acces restreint, ambulance appelee", "mesures_immediates not saved"
        assert data.get("temoins") == "Pierre Durand, Sophie Bernard", "temoins not saved"
        assert data.get("type_lesion_potentielle") == "CONTUSION", "type_lesion_potentielle not saved"
        assert len(data.get("facteurs_contributifs", [])) == 2, "facteurs_contributifs count wrong"
        assert "HUMAIN" in data.get("facteurs_contributifs", []), "HUMAIN not in facteurs"
        assert "fin de journee" in data.get("conditions_incident", "").lower(), "conditions_incident not saved"
        
        print(f"Create with ALL new fields: PASS - ID: {data.get('id')}")
        return data.get("id")


class TestPresquAccidentUpdateNewFields:
    """Test updating presqu'accident with new fields"""
    
    @pytest.fixture
    def test_item_id(self, api_client):
        """Create a test item for update tests"""
        payload = {
            "titre": "TEST_UPDATE_BASE_ITEM",
            "description": "Base item for update tests",
            "date_incident": "2026-01-15",
            "lieu": "Zone Test",
            "service": "AUTRE"
        }
        response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=payload)
        assert response.status_code == 200
        item_id = response.json().get("id")
        yield item_id
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/presqu-accident/items/{item_id}")
    
    def test_update_categorie_incident(self, api_client, test_item_id):
        """Test PUT to update categorie_incident"""
        response = api_client.put(f"{BASE_URL}/api/presqu-accident/items/{test_item_id}", json={
            "categorie_incident": "BRULURE"
        })
        assert response.status_code == 200, f"Update failed: {response.status_code} - {response.text}"
        
        # Verify via GET
        get_response = api_client.get(f"{BASE_URL}/api/presqu-accident/items/{test_item_id}")
        assert get_response.status_code == 200
        data = get_response.json()
        assert data.get("categorie_incident") == "BRULURE", "categorie_incident not updated"
        print("Update categorie_incident: PASS")
    
    def test_update_equipement_link(self, api_client, test_item_id):
        """Test PUT to update equipement link"""
        response = api_client.put(f"{BASE_URL}/api/presqu-accident/items/{test_item_id}", json={
            "equipement_id": "test-eq-updated",
            "equipement_nom": "Equipement Mis a Jour"
        })
        assert response.status_code == 200, f"Update failed: {response.status_code} - {response.text}"
        
        # Verify via GET
        get_response = api_client.get(f"{BASE_URL}/api/presqu-accident/items/{test_item_id}")
        data = get_response.json()
        assert data.get("equipement_nom") == "Equipement Mis a Jour", "equipement_nom not updated"
        print("Update equipement link: PASS")
    
    def test_update_facteurs_contributifs(self, api_client, test_item_id):
        """Test PUT to update facteurs_contributifs array"""
        response = api_client.put(f"{BASE_URL}/api/presqu-accident/items/{test_item_id}", json={
            "facteurs_contributifs": ["ORGANISATIONNEL", "ENVIRONNEMENTAL"]
        })
        assert response.status_code == 200, f"Update failed: {response.status_code} - {response.text}"
        
        # Verify via GET
        get_response = api_client.get(f"{BASE_URL}/api/presqu-accident/items/{test_item_id}")
        data = get_response.json()
        facteurs = data.get("facteurs_contributifs", [])
        assert "ORGANISATIONNEL" in facteurs, "ORGANISATIONNEL not in updated facteurs"
        assert "ENVIRONNEMENTAL" in facteurs, "ENVIRONNEMENTAL not in updated facteurs"
        print(f"Update facteurs_contributifs: PASS - {len(facteurs)} facteurs")
    
    def test_update_all_new_fields(self, api_client, test_item_id):
        """Test PUT to update all new fields at once"""
        response = api_client.put(f"{BASE_URL}/api/presqu-accident/items/{test_item_id}", json={
            "categorie_incident": "ELECTRIQUE",
            "equipement_id": "eq-test-all",
            "equipement_nom": "Machine Electrique",
            "mesures_immediates": "Coupure du courant immédiate",
            "temoins": "Jean, Marie, Pierre",
            "type_lesion_potentielle": "ELECTRISATION",
            "facteurs_contributifs": ["MATERIEL", "HUMAIN"],
            "conditions_incident": "Intervention de maintenance non autorisee"
        })
        assert response.status_code == 200, f"Update failed: {response.status_code} - {response.text}"
        
        # Verify all fields via GET
        get_response = api_client.get(f"{BASE_URL}/api/presqu-accident/items/{test_item_id}")
        data = get_response.json()
        
        assert data.get("categorie_incident") == "ELECTRIQUE"
        assert data.get("equipement_nom") == "Machine Electrique"
        assert data.get("mesures_immediates") == "Coupure du courant immédiate"
        assert data.get("temoins") == "Jean, Marie, Pierre"
        assert data.get("type_lesion_potentielle") == "ELECTRISATION"
        assert "MATERIEL" in data.get("facteurs_contributifs", [])
        print("Update all new fields: PASS")


class TestPresquAccidentGetWithNewFields:
    """Test GET returns items with new fields"""
    
    def test_get_items_includes_new_fields(self, api_client):
        """Test GET /api/presqu-accident/items returns items with new fields"""
        # First create an item with all fields
        test_id = str(uuid.uuid4())[:8]
        create_payload = {
            "titre": f"TEST_{test_id}_GET_FIELDS_TEST",
            "description": "Item for testing GET returns new fields",
            "date_incident": "2026-01-15",
            "lieu": "Zone GET Test",
            "service": "LABO",
            "categorie_incident": "EXPOSITION_CHIMIQUE",
            "mesures_immediates": "Ventilation activee",
            "temoins": "Laborantin Test",
            "type_lesion_potentielle": "INTOXICATION",
            "facteurs_contributifs": ["ENVIRONNEMENTAL"],
            "conditions_incident": "Manipulation produit chimique sans hotte"
        }
        create_response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=create_payload)
        assert create_response.status_code == 200
        created_id = create_response.json().get("id")
        
        # Get all items
        response = api_client.get(f"{BASE_URL}/api/presqu-accident/items")
        assert response.status_code == 200
        items = response.json()
        
        # Find our test item
        test_item = next((i for i in items if i.get("id") == created_id), None)
        assert test_item is not None, "Test item not found in GET response"
        
        # Verify new fields are present
        assert "categorie_incident" in test_item, "categorie_incident field missing from GET"
        assert "mesures_immediates" in test_item, "mesures_immediates field missing from GET"
        assert "temoins" in test_item, "temoins field missing from GET"
        assert "type_lesion_potentielle" in test_item, "type_lesion_potentielle field missing from GET"
        assert "facteurs_contributifs" in test_item, "facteurs_contributifs field missing from GET"
        assert "conditions_incident" in test_item, "conditions_incident field missing from GET"
        assert "equipement_id" in test_item, "equipement_id field missing from GET"
        assert "equipement_nom" in test_item, "equipement_nom field missing from GET"
        
        # Verify values
        assert test_item.get("categorie_incident") == "EXPOSITION_CHIMIQUE"
        assert test_item.get("type_lesion_potentielle") == "INTOXICATION"
        
        print(f"GET includes new fields: PASS - All 8 new fields present")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/presqu-accident/items/{created_id}")
    
    def test_get_single_item_includes_new_fields(self, api_client):
        """Test GET /api/presqu-accident/items/{id} returns item with new fields"""
        # Create item
        test_id = str(uuid.uuid4())[:8]
        create_payload = {
            "titre": f"TEST_{test_id}_SINGLE_GET",
            "description": "Testing single GET",
            "date_incident": "2026-01-15",
            "lieu": "Zone Single",
            "service": "MAINTENANCE",
            "categorie_incident": "COINCEMENT",
            "facteurs_contributifs": ["HUMAIN", "MATERIEL"]
        }
        create_response = api_client.post(f"{BASE_URL}/api/presqu-accident/items", json=create_payload)
        created_id = create_response.json().get("id")
        
        # Get single item
        response = api_client.get(f"{BASE_URL}/api/presqu-accident/items/{created_id}")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("categorie_incident") == "COINCEMENT"
        assert len(data.get("facteurs_contributifs", [])) == 2
        
        print("GET single item with new fields: PASS")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/presqu-accident/items/{created_id}")


class TestPresquAccidentEquipmentList:
    """Test equipment list for dropdown"""
    
    def test_get_equipments_list(self, api_client):
        """Verify equipment list endpoint works for dropdown"""
        response = api_client.get(f"{BASE_URL}/api/equipments")
        assert response.status_code == 200, f"GET equipments failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            # Verify equipment structure
            eq = data[0]
            assert "id" in eq or "_id" in eq, "Equipment should have id"
            assert "nom" in eq, "Equipment should have nom"
            print(f"GET equipments: PASS - {len(data)} equipments available for dropdown")
        else:
            print("GET equipments: PASS (empty list)")


class TestCleanup:
    """Cleanup test items"""
    
    def test_cleanup_test_items(self, api_client):
        """Remove all TEST_ prefixed items"""
        response = api_client.get(f"{BASE_URL}/api/presqu-accident/items")
        if response.status_code == 200:
            items = response.json()
            test_items = [i for i in items if i.get("titre", "").startswith("TEST_")]
            
            deleted = 0
            for item in test_items:
                del_response = api_client.delete(f"{BASE_URL}/api/presqu-accident/items/{item['id']}")
                if del_response.status_code in [200, 204]:
                    deleted += 1
            
            print(f"Cleanup: Deleted {deleted} test items")
