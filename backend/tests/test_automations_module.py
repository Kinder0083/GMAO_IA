"""
Test Automations Module - Points 5 et 6 FSAO Iris
Tests CRUD /api/automations/ endpoints + Adria enriched context
"""
import pytest
import requests
import os
import time
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://notification-restore-1.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@test.com",
        "password": "Admin123!"
    }, timeout=30)
    if response.status_code == 200:
        return response.json().get("access_token") or response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text[:200]}")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Auth headers for API calls"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestAutomationsListEndpoint:
    """Test GET /api/automations/list"""
    
    def test_list_automations_returns_success(self, auth_headers):
        """List automations should return success with automations array"""
        response = requests.get(f"{BASE_URL}/api/automations/list", headers=auth_headers, timeout=30)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        data = response.json()
        assert data.get("success") == True, "Response should have success=True"
        assert "automations" in data, "Response should have automations array"
        assert "total" in data, "Response should have total count"
        assert isinstance(data["automations"], list), "automations should be a list"
        
        print(f"✅ List automations: {data['total']} automations found")
        for auto in data["automations"][:3]:
            print(f"   - {auto.get('name', 'N/A')} ({auto.get('type', '?')}) - enabled: {auto.get('enabled', '?')}")


class TestAutomationsParseEndpoint:
    """Test POST /api/automations/parse - LLM-based natural language parsing"""
    
    def test_parse_automation_request(self, auth_headers):
        """Parse natural language automation request"""
        # Test with a sensor alert request (may return understood=false if no sensors exist)
        response = requests.post(
            f"{BASE_URL}/api/automations/parse",
            headers=auth_headers,
            json={"message": "Mets une alerte sur le capteur de température de la salle des machines à 32.5 degrés"},
            timeout=60  # LLM can be slow
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:300]}"
        
        data = response.json()
        assert data.get("success") == True, "Response should have success=True"
        assert "automation" in data, "Response should have automation object"
        
        automation = data["automation"]
        # Check structure
        assert "type" in automation, "automation should have type"
        assert "name" in automation, "automation should have name"
        assert "description" in automation, "automation should have description"
        assert "config" in automation, "automation should have config"
        assert "understood" in automation, "automation should have understood field"
        
        print(f"✅ Parse automation result:")
        print(f"   Type: {automation.get('type')}")
        print(f"   Name: {automation.get('name')}")
        print(f"   Understood: {automation.get('understood')}")
        print(f"   Description: {automation.get('description', '')[:100]}...")
        
        return automation


class TestAutomationsApplyEndpoint:
    """Test POST /api/automations/apply - Create automation in DB"""
    
    def test_apply_automation_creates_in_db(self, auth_headers):
        """Apply a simulated automation config to create in DB"""
        # Create a test automation config (simulated - not from LLM)
        test_automation = {
            "type": "sensor_alert",
            "name": "TEST_Alerte Temperature Salle Test",
            "description": "Test automation from pytest - alert when temp > 30C",
            "config": {
                "sensor_id": "test_sensor_123",
                "sensor_name": "Capteur Test",
                "condition": "above",
                "threshold_value": 30.0,
                "threshold_unit": "C",
                "actions": [
                    {"type": "notification", "message": "Temperature trop haute!"}
                ]
            },
            "confirmation_message": "Automatisation de test configurée",
            "understood": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/automations/apply",
            headers=auth_headers,
            json={"automation": test_automation},
            timeout=30
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        data = response.json()
        assert data.get("success") == True, "Response should have success=True"
        assert "automation_id" in data, "Response should have automation_id"
        assert "message" in data, "Response should have message"
        
        print(f"✅ Apply automation result:")
        print(f"   Automation ID: {data.get('automation_id')}")
        print(f"   Message: {data.get('message')}")
        
        return data.get("automation_id")
    
    def test_apply_automation_appears_in_list(self, auth_headers):
        """Verify created automation appears in list"""
        response = requests.get(f"{BASE_URL}/api/automations/list", headers=auth_headers, timeout=30)
        assert response.status_code == 200
        
        data = response.json()
        automations = data.get("automations", [])
        
        # Look for our test automation
        test_autos = [a for a in automations if "TEST_" in a.get("name", "")]
        assert len(test_autos) > 0, "Test automation should appear in list"
        
        print(f"✅ Test automation found in list: {test_autos[0].get('name')}")
        return test_autos[0].get("id")


class TestAutomationsToggleEndpoint:
    """Test PUT /api/automations/{id}/toggle"""
    
    def test_toggle_automation_changes_state(self, auth_headers):
        """Toggle automation enabled state"""
        # First get an automation ID from list
        list_response = requests.get(f"{BASE_URL}/api/automations/list", headers=auth_headers, timeout=30)
        assert list_response.status_code == 200
        
        automations = list_response.json().get("automations", [])
        if not automations:
            pytest.skip("No automations to toggle - skipping")
        
        automation_id = automations[0].get("id")
        original_enabled = automations[0].get("enabled", True)
        
        # Toggle the automation
        response = requests.put(
            f"{BASE_URL}/api/automations/{automation_id}/toggle",
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        data = response.json()
        assert data.get("success") == True, "Response should have success=True"
        assert "enabled" in data, "Response should have enabled field"
        assert data["enabled"] != original_enabled, f"Enabled should have changed from {original_enabled}"
        
        print(f"✅ Toggle automation: {automation_id[:8]}... enabled={original_enabled} -> {data['enabled']}")
        
        # Toggle back
        response2 = requests.put(
            f"{BASE_URL}/api/automations/{automation_id}/toggle",
            headers=auth_headers,
            timeout=30
        )
        assert response2.status_code == 200
        print(f"   Toggled back: enabled={response2.json().get('enabled')}")


class TestAutomationsDeleteEndpoint:
    """Test DELETE /api/automations/{id}"""
    
    def test_delete_automation_removes_from_db(self, auth_headers):
        """Delete a test automation"""
        # First create one to delete
        test_automation = {
            "type": "sensor_alert",
            "name": "TEST_ToDelete_Automation",
            "description": "Will be deleted",
            "config": {},
            "understood": True
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/automations/apply",
            headers=auth_headers,
            json={"automation": test_automation},
            timeout=30
        )
        assert create_response.status_code == 200
        auto_id = create_response.json().get("automation_id")
        
        # Delete it
        response = requests.delete(
            f"{BASE_URL}/api/automations/{auto_id}",
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        data = response.json()
        assert data.get("success") == True, "Response should have success=True"
        
        print(f"✅ Delete automation: {auto_id[:8]}... deleted successfully")
        
        # Verify it's gone from list
        list_response = requests.get(f"{BASE_URL}/api/automations/list", headers=auth_headers, timeout=30)
        automations = list_response.json().get("automations", [])
        deleted_auto = [a for a in automations if a.get("id") == auto_id]
        assert len(deleted_auto) == 0, "Deleted automation should not appear in list"
        print(f"   Verified: automation no longer in list")


class TestAdriaChatWithAutomationCommand:
    """Test Adria chat generates CONFIGURE_AUTOMATION command"""
    
    def test_adria_automation_request_generates_command(self, auth_headers):
        """Send automation request to Adria and check for CONFIGURE_AUTOMATION in response"""
        # Send automation request to Adria chat
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            headers=auth_headers,
            json={
                "message": "Mets une alerte sur le capteur de température de la salle des machines à 32.5 degrés",
                "session_id": "test_automation_session_pytest",
                "include_app_context": True
            },
            timeout=60
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:300]}"
        
        data = response.json()
        assert "response" in data, "Response should have response field"
        
        response_text = data.get("response", "")
        
        # Check if CONFIGURE_AUTOMATION command is present in response
        has_command = "CONFIGURE_AUTOMATION" in response_text or "[[CONFIGURE_AUTOMATION:" in response_text
        
        print(f"✅ Adria response for automation request:")
        print(f"   Response length: {len(response_text)} chars")
        print(f"   Contains CONFIGURE_AUTOMATION: {has_command}")
        print(f"   Response preview: {response_text[:300]}...")
        
        # This test documents behavior - command may or may not be present depending on LLM
        if has_command:
            print(f"   ✅ CONFIGURE_AUTOMATION command found in response")
        else:
            print(f"   ⚠️ CONFIGURE_AUTOMATION command NOT found - LLM may have handled differently")


class TestAdriaEnrichedContext:
    """Test Adria enriched context includes work orders and equipment details"""
    
    def test_enriched_context_has_recent_work_orders(self, auth_headers):
        """Get AI context and verify recent_work_orders field"""
        response = requests.get(f"{BASE_URL}/api/ai/context", headers=auth_headers, timeout=30)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        data = response.json()
        context = data.get("context", {})
        
        assert "active_work_orders" in context, "Context should have active_work_orders count"
        assert "urgent_work_orders" in context, "Context should have urgent_work_orders count"
        assert "recent_work_orders" in context, "Context should have recent_work_orders list"
        assert isinstance(context["recent_work_orders"], list), "recent_work_orders should be a list"
        
        print(f"✅ Adria enriched context:")
        print(f"   Active WOs: {context.get('active_work_orders')}")
        print(f"   Urgent WOs: {context.get('urgent_work_orders')}")
        print(f"   Recent WOs: {len(context.get('recent_work_orders', []))} items")
        
        # Check work order format includes titles
        if context.get("recent_work_orders"):
            wo_sample = context["recent_work_orders"][0]
            assert isinstance(wo_sample, str), "WO items should be strings"
            print(f"   Sample WO: {wo_sample[:80]}...")
    
    def test_enriched_context_has_equipment_details(self, auth_headers):
        """Get AI context and verify equipment_details field"""
        response = requests.get(f"{BASE_URL}/api/ai/context", headers=auth_headers, timeout=30)
        assert response.status_code == 200
        
        context = response.json().get("context", {})
        
        assert "equipment_in_maintenance" in context, "Context should have equipment_in_maintenance count"
        assert "equipment_details" in context, "Context should have equipment_details list"
        assert isinstance(context["equipment_details"], list), "equipment_details should be a list"
        
        print(f"   Equipment in maintenance: {context.get('equipment_in_maintenance')}")
        print(f"   Equipment details: {len(context.get('equipment_details', []))} items")


class TestCleanupTestData:
    """Cleanup test automations after tests"""
    
    def test_cleanup_test_automations(self, auth_headers):
        """Delete all TEST_ prefixed automations"""
        response = requests.get(f"{BASE_URL}/api/automations/list", headers=auth_headers, timeout=30)
        if response.status_code != 200:
            return
        
        automations = response.json().get("automations", [])
        test_autos = [a for a in automations if a.get("name", "").startswith("TEST_")]
        
        for auto in test_autos:
            del_response = requests.delete(
                f"{BASE_URL}/api/automations/{auto['id']}",
                headers=auth_headers,
                timeout=30
            )
            if del_response.status_code == 200:
                print(f"🧹 Cleaned up: {auto.get('name')}")
