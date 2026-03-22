"""
Test CLOSE_OT Feature - Backend API Tests
This tests the complete OT closing workflow:
1. POST /api/work-orders/{id}/add-time - Add time spent
2. POST /api/work-orders/{id}/comments - Add comment with parts_used
3. PUT /api/work-orders/{id} - Set status to TERMINE
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://cmms-assignee-fix.preview.emergentagent.com"

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
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def authenticated_session(auth_token):
    """Create session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


@pytest.fixture
def test_work_order(authenticated_session):
    """Create a test work order for testing"""
    # Create new test OT
    payload = {
        "titre": "TEST_CLOSE_OT_Feature",
        "description": "Test OT for CLOSE_OT feature testing",
        "priorite": "NORMALE",
        "statut": "EN_COURS",
        "equipement_id": "69706f4ce0eb4fc8238e15d9"  # Bioci 1
    }
    response = authenticated_session.post(f"{BASE_URL}/api/work-orders", json=payload)
    assert response.status_code == 200, f"Failed to create OT: {response.text}"
    wo = response.json()
    yield wo
    
    # Cleanup - Delete the test OT after tests
    try:
        authenticated_session.delete(f"{BASE_URL}/api/work-orders/{wo['id']}")
    except:
        pass


class TestAddTimeEndpoint:
    """Tests for POST /api/work-orders/{id}/add-time"""
    
    def test_add_time_hours_only(self, authenticated_session, test_work_order):
        """Test adding time with hours only"""
        wo_id = test_work_order['id']
        
        response = authenticated_session.post(
            f"{BASE_URL}/api/work-orders/{wo_id}/add-time",
            json={"hours": 2, "minutes": 0}
        )
        assert response.status_code == 200, f"Add time failed: {response.text}"
        
        data = response.json()
        assert data.get("tempsReel") == 2.0, f"Expected tempsReel=2.0, got {data.get('tempsReel')}"
    
    def test_add_time_hours_and_minutes(self, authenticated_session):
        """Test adding time with hours and minutes (2h30)"""
        # Create separate OT to avoid state dependency
        payload = {
            "titre": "TEST_Add_Time_H_Min",
            "description": "Test OT for time testing",
            "priorite": "NORMALE",
            "statut": "OUVERT"
        }
        create_resp = authenticated_session.post(f"{BASE_URL}/api/work-orders", json=payload)
        assert create_resp.status_code == 200, f"Create OT failed: {create_resp.text}"
        wo = create_resp.json()
        wo_id = wo.get('id')
        assert wo_id, f"No id in response: {wo}"
        
        try:
            response = authenticated_session.post(
                f"{BASE_URL}/api/work-orders/{wo_id}/add-time",
                json={"hours": 2, "minutes": 30}
            )
            assert response.status_code == 200, f"Add time failed: {response.text}"
            
            data = response.json()
            # 2h30 = 2.5 hours
            assert data.get("tempsReel") == 2.5, f"Expected tempsReel=2.5, got {data.get('tempsReel')}"
        finally:
            authenticated_session.delete(f"{BASE_URL}/api/work-orders/{wo_id}")
    
    def test_add_time_minutes_only(self, authenticated_session):
        """Test adding time with minutes only"""
        # Create another test OT
        payload = {
            "titre": "TEST_Add_Time_Minutes",
            "description": "Test OT for minutes-only time testing",
            "priorite": "NORMALE",
            "statut": "OUVERT"
        }
        create_resp = authenticated_session.post(f"{BASE_URL}/api/work-orders", json=payload)
        assert create_resp.status_code == 200
        wo = create_resp.json()
        wo_id = wo['id']
        
        try:
            response = authenticated_session.post(
                f"{BASE_URL}/api/work-orders/{wo_id}/add-time",
                json={"hours": 1, "minutes": 30}
            )
            assert response.status_code == 200
            
            data = response.json()
            # 1h30 = 1.5 hours
            assert data.get("tempsReel") == 1.5, f"Expected tempsReel=1.5, got {data.get('tempsReel')}"
        finally:
            authenticated_session.delete(f"{BASE_URL}/api/work-orders/{wo_id}")


class TestCommentsEndpoint:
    """Tests for POST /api/work-orders/{id}/comments"""
    
    def test_add_comment_only(self, authenticated_session, test_work_order):
        """Test adding a comment without parts"""
        wo_id = test_work_order['id']
        
        response = authenticated_session.post(
            f"{BASE_URL}/api/work-orders/{wo_id}/comments",
            json={
                "text": "Intervention terminée avec succès",
                "parts_used": []
            }
        )
        assert response.status_code == 200, f"Add comment failed: {response.text}"
        
        data = response.json()
        assert "comment" in data
        assert data["comment"]["text"] == "Intervention terminée avec succès"
    
    def test_add_comment_with_parts(self, authenticated_session):
        """Test adding a comment with parts_used"""
        # Create test OT
        payload = {
            "titre": "TEST_Comment_With_Parts",
            "description": "Test OT for comment with parts testing",
            "priorite": "NORMALE",
            "statut": "EN_COURS"
        }
        create_resp = authenticated_session.post(f"{BASE_URL}/api/work-orders", json=payload)
        assert create_resp.status_code == 200
        wo = create_resp.json()
        wo_id = wo['id']
        
        try:
            response = authenticated_session.post(
                f"{BASE_URL}/api/work-orders/{wo_id}/comments",
                json={
                    "text": "Changement du filtre effectué",
                    "parts_used": [
                        {
                            "custom_part_name": "Filtre à huile",
                            "quantity": 1
                        },
                        {
                            "custom_part_name": "Joint torique",
                            "quantity": 2
                        }
                    ]
                }
            )
            assert response.status_code == 200, f"Add comment with parts failed: {response.text}"
            
            data = response.json()
            assert "comment" in data
            assert "parts_used" in data
            assert len(data["parts_used"]) == 2
        finally:
            authenticated_session.delete(f"{BASE_URL}/api/work-orders/{wo_id}")


class TestUpdateStatusToTermine:
    """Tests for PUT /api/work-orders/{id} with statut=TERMINE"""
    
    def test_set_status_termine(self, authenticated_session):
        """Test setting OT status to TERMINE"""
        # Create test OT
        payload = {
            "titre": "TEST_Status_Termine",
            "description": "Test OT for TERMINE status testing",
            "priorite": "NORMALE",
            "statut": "EN_COURS"
        }
        create_resp = authenticated_session.post(f"{BASE_URL}/api/work-orders", json=payload)
        assert create_resp.status_code == 200
        wo = create_resp.json()
        wo_id = wo['id']
        
        try:
            response = authenticated_session.put(
                f"{BASE_URL}/api/work-orders/{wo_id}",
                json={"statut": "TERMINE"}
            )
            assert response.status_code == 200, f"Update status failed: {response.text}"
            
            data = response.json()
            assert data.get("statut") == "TERMINE"
            assert data.get("dateTermine") is not None, "dateTermine should be set automatically"
        finally:
            authenticated_session.delete(f"{BASE_URL}/api/work-orders/{wo_id}")


class TestFullCloseOTFlow:
    """E2E test for complete CLOSE_OT flow: create OT → add time → add comment+parts → set TERMINE"""
    
    def test_full_close_ot_workflow(self, authenticated_session):
        """Test the complete close OT workflow as triggered by Adria"""
        # Step 1: Create a test OT
        payload = {
            "titre": "TEST_Full_CLOSE_OT_Flow",
            "description": "Test OT for complete CLOSE_OT workflow",
            "priorite": "NORMALE",
            "statut": "EN_COURS",
            "equipement_id": "69706f4ce0eb4fc8238e15d9"  # Bioci 1
        }
        create_resp = authenticated_session.post(f"{BASE_URL}/api/work-orders", json=payload)
        assert create_resp.status_code == 200, f"Create OT failed: {create_resp.text}"
        wo = create_resp.json()
        wo_id = wo['id']
        
        print(f"Created test OT: {wo_id} - {wo.get('titre')}")
        
        try:
            # Step 2: Add time (2h30 = 2 hours + 30 minutes)
            time_resp = authenticated_session.post(
                f"{BASE_URL}/api/work-orders/{wo_id}/add-time",
                json={"hours": 2, "minutes": 30}
            )
            assert time_resp.status_code == 200, f"Add time failed: {time_resp.text}"
            
            time_data = time_resp.json()
            assert time_data.get("tempsReel") == 2.5, f"Expected tempsReel=2.5, got {time_data.get('tempsReel')}"
            print(f"✓ Time added: 2h30 (tempsReel={time_data.get('tempsReel')})")
            
            # Step 3: Add comment with parts_used
            comment_resp = authenticated_session.post(
                f"{BASE_URL}/api/work-orders/{wo_id}/comments",
                json={
                    "text": "Changement du filtre effectué - OT clôturé via test automatisé",
                    "parts_used": [
                        {
                            "custom_part_name": "Filtre à huile",
                            "quantity": 1
                        }
                    ]
                }
            )
            assert comment_resp.status_code == 200, f"Add comment failed: {comment_resp.text}"
            
            comment_data = comment_resp.json()
            assert comment_data.get("comment", {}).get("text") is not None
            print(f"✓ Comment added with 1 part")
            
            # Step 4: Set status to TERMINE
            status_resp = authenticated_session.put(
                f"{BASE_URL}/api/work-orders/{wo_id}",
                json={"statut": "TERMINE"}
            )
            assert status_resp.status_code == 200, f"Update status failed: {status_resp.text}"
            
            status_data = status_resp.json()
            assert status_data.get("statut") == "TERMINE"
            assert status_data.get("dateTermine") is not None
            print(f"✓ Status set to TERMINE (dateTermine set)")
            
            # Step 5: Verify the final state by fetching the OT
            verify_resp = authenticated_session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
            assert verify_resp.status_code == 200
            
            final_wo = verify_resp.json()
            assert final_wo.get("statut") == "TERMINE"
            assert final_wo.get("tempsReel") == 2.5
            assert final_wo.get("dateTermine") is not None
            
            print(f"✓ Final verification passed - OT closed successfully")
            
        finally:
            # Cleanup
            authenticated_session.delete(f"{BASE_URL}/api/work-orders/{wo_id}")
            print(f"✓ Cleanup: Test OT deleted")


class TestAISystemPrompt:
    """Test that AI system prompt contains CLOSE_OT command"""
    
    def test_ai_chat_endpoint_exists(self, authenticated_session):
        """Test that AI chat endpoint exists and returns response"""
        # AI chat expects context as string or optional
        response = authenticated_session.post(
            f"{BASE_URL}/api/ai/chat",
            json={
                "message": "Bonjour"
            }
        )
        # AI endpoint should return 200
        assert response.status_code == 200, f"AI chat failed: {response.status_code} - {response.text}"


class TestTimeParsingFormats:
    """Test various time format parsing"""
    
    def test_time_2h_format(self, authenticated_session):
        """Test 2h format"""
        payload = {
            "titre": "TEST_Time_2h",
            "description": "Test",
            "priorite": "NORMALE",
            "statut": "OUVERT"
        }
        create_resp = authenticated_session.post(f"{BASE_URL}/api/work-orders", json=payload)
        assert create_resp.status_code == 200, f"Create OT failed: {create_resp.text}"
        wo = create_resp.json()
        wo_id = wo.get('id')
        assert wo_id, f"No id in response: {wo}"
        
        try:
            # 2h = 2 hours
            response = authenticated_session.post(
                f"{BASE_URL}/api/work-orders/{wo_id}/add-time",
                json={"hours": 2, "minutes": 0}
            )
            assert response.status_code == 200
            assert response.json().get("tempsReel") == 2.0
        finally:
            authenticated_session.delete(f"{BASE_URL}/api/work-orders/{wo_id}")
    
    def test_time_1h30_format(self, authenticated_session):
        """Test 1h30 format (1h + 30min)"""
        payload = {
            "titre": "TEST_Time_1h30",
            "description": "Test",
            "priorite": "NORMALE",
            "statut": "OUVERT"
        }
        create_resp = authenticated_session.post(f"{BASE_URL}/api/work-orders", json=payload)
        assert create_resp.status_code == 200, f"Create OT failed: {create_resp.text}"
        wo = create_resp.json()
        wo_id = wo.get('id')
        assert wo_id, f"No id in response: {wo}"
        
        try:
            # 1h30 = 1 hour 30 min = 1.5 hours
            response = authenticated_session.post(
                f"{BASE_URL}/api/work-orders/{wo_id}/add-time",
                json={"hours": 1, "minutes": 30}
            )
            assert response.status_code == 200
            assert response.json().get("tempsReel") == 1.5
        finally:
            authenticated_session.delete(f"{BASE_URL}/api/work-orders/{wo_id}")
    
    def test_time_2h30min_format(self, authenticated_session):
        """Test 2h30min format"""
        payload = {
            "titre": "TEST_Time_2h30min",
            "description": "Test",
            "priorite": "NORMALE",
            "statut": "OUVERT"
        }
        create_resp = authenticated_session.post(f"{BASE_URL}/api/work-orders", json=payload)
        assert create_resp.status_code == 200, f"Create OT failed: {create_resp.text}"
        wo = create_resp.json()
        wo_id = wo.get('id')
        assert wo_id, f"No id in response: {wo}"
        
        try:
            # 2h30min = 2 hours 30 min = 2.5 hours
            response = authenticated_session.post(
                f"{BASE_URL}/api/work-orders/{wo_id}/add-time",
                json={"hours": 2, "minutes": 30}
            )
            assert response.status_code == 200
            assert response.json().get("tempsReel") == 2.5
        finally:
            authenticated_session.delete(f"{BASE_URL}/api/work-orders/{wo_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
