"""
Tests for Surveillance AI History, Analytics, and Alerts Endpoints (Phase 2, 3, 4)

Features tested:
- GET /api/surveillance/ai/history - Retrieve AI analysis history with filters
- GET /api/surveillance/ai/history/{analysis_id} - Get detail of a specific analysis
- GET /api/surveillance/ai/analytics - KPIs, monthly evolution, data by organisme/category/result
- GET /api/surveillance/ai/alerts - Smart alerts (degradation, low conformity, missing work orders)
- POST /api/surveillance/ai/create-batch - Verify it archives the analysis to ai_analysis_history
"""
import pytest
import requests
import os

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://pending-instructions-3.preview.emergentagent.com"

# Test credentials
TEST_EMAIL = "admin@test.com"
TEST_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for testing"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - cannot proceed with tests")


@pytest.fixture(scope="module")
def authenticated_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestAIHistoryEndpoint:
    """Test GET /api/surveillance/ai/history endpoint"""
    
    def test_ai_history_endpoint_exists(self, authenticated_headers):
        """Test that the AI history endpoint exists and is accessible"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/history",
            headers=authenticated_headers
        )
        # Should return 200 even if no data
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total" in data, "Response should contain 'total' field"
        assert "items" in data, "Response should contain 'items' field"
        print(f"AI History endpoint OK - Found {data['total']} analyses")
    
    def test_ai_history_returns_correct_structure(self, authenticated_headers):
        """Test that history items have correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/history",
            headers=authenticated_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["total"] > 0:
            item = data["items"][0]
            # Check required fields
            assert "id" in item, "Item should have 'id' field"
            assert "filename" in item, "Item should have 'filename' field"
            assert "created_at" in item, "Item should have 'created_at' field"
            assert "controles_count" in item, "Item should have 'controles_count' field"
            assert "conformes_count" in item, "Item should have 'conformes_count' field"
            assert "non_conformes_count" in item, "Item should have 'non_conformes_count' field"
            # raw_extracted_data should be excluded from list view
            assert "raw_extracted_data" not in item, "List should not include raw_extracted_data"
            print(f"History item structure OK: {item.get('filename')}")
        else:
            print("No history items to verify structure, test skipped")
    
    def test_ai_history_filter_by_organisme(self, authenticated_headers):
        """Test filtering history by organisme"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/history",
            params={"organisme": "APAVE"},
            headers=authenticated_headers
        )
        assert response.status_code == 200
        data = response.json()
        # Filter should work (may return 0 if no APAVE data)
        print(f"Filter by organisme=APAVE returned {data['total']} results")
    
    def test_ai_history_filter_by_category(self, authenticated_headers):
        """Test filtering history by category"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/history",
            params={"category": "MANUTENTION"},
            headers=authenticated_headers
        )
        assert response.status_code == 200
        data = response.json()
        print(f"Filter by category=MANUTENTION returned {data['total']} results")


class TestAIHistoryDetailEndpoint:
    """Test GET /api/surveillance/ai/history/{analysis_id} endpoint"""
    
    def test_ai_history_detail_endpoint_exists(self, authenticated_headers):
        """Test getting detail of a specific analysis"""
        # First get an analysis ID from history
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/history",
            headers=authenticated_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["total"] == 0:
            pytest.skip("No analysis history to test detail endpoint")
        
        analysis_id = data["items"][0]["id"]
        
        # Now get detail
        detail_response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/history/{analysis_id}",
            headers=authenticated_headers
        )
        assert detail_response.status_code == 200, f"Expected 200, got {detail_response.status_code}"
        detail = detail_response.json()
        
        # Detail should include raw_extracted_data
        assert "id" in detail
        assert "filename" in detail
        assert "raw_extracted_data" in detail, "Detail should include raw_extracted_data"
        print(f"Detail endpoint OK for analysis: {detail.get('filename')}")
    
    def test_ai_history_detail_not_found(self, authenticated_headers):
        """Test 404 for non-existent analysis"""
        fake_id = "non-existent-analysis-id-12345"
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/history/{fake_id}",
            headers=authenticated_headers
        )
        assert response.status_code == 404, f"Expected 404 for non-existent analysis, got {response.status_code}"
        print("404 correctly returned for non-existent analysis")


class TestAIAnalyticsEndpoint:
    """Test GET /api/surveillance/ai/analytics endpoint (Phase 3)"""
    
    def test_ai_analytics_endpoint_exists(self, authenticated_headers):
        """Test that analytics endpoint exists and returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/analytics",
            headers=authenticated_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check required keys
        assert "kpis" in data, "Response should contain 'kpis'"
        assert "evolution_mensuelle" in data, "Response should contain 'evolution_mensuelle'"
        assert "par_organisme" in data, "Response should contain 'par_organisme'"
        assert "par_categorie" in data, "Response should contain 'par_categorie'"
        assert "par_resultat" in data, "Response should contain 'par_resultat'"
        assert "tendances_degradation" in data, "Response should contain 'tendances_degradation'"
        print("Analytics endpoint structure OK")
    
    def test_ai_analytics_kpis_structure(self, authenticated_headers):
        """Test KPIs have correct fields"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/analytics",
            headers=authenticated_headers
        )
        assert response.status_code == 200
        kpis = response.json()["kpis"]
        
        assert "total_analyses" in kpis, "KPIs should have 'total_analyses'"
        assert "total_controles" in kpis, "KPIs should have 'total_controles'"
        assert "taux_conformite" in kpis, "KPIs should have 'taux_conformite'"
        assert "total_non_conformites" in kpis, "KPIs should have 'total_non_conformites'"
        assert "total_work_orders" in kpis, "KPIs should have 'total_work_orders'"
        
        print(f"KPIs: {kpis['total_analyses']} analyses, {kpis['total_controles']} controls, {kpis['taux_conformite']}% conformity")
    
    def test_ai_analytics_evolution_mensuelle(self, authenticated_headers):
        """Test monthly evolution data structure"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/analytics",
            headers=authenticated_headers
        )
        assert response.status_code == 200
        evolution = response.json()["evolution_mensuelle"]
        
        assert isinstance(evolution, list), "evolution_mensuelle should be a list"
        if len(evolution) > 0:
            item = evolution[0]
            assert "mois" in item, "Evolution item should have 'mois'"
            assert "analyses" in item, "Evolution item should have 'analyses'"
            assert "controles" in item, "Evolution item should have 'controles'"
            assert "conformes" in item, "Evolution item should have 'conformes'"
            print(f"Monthly evolution: {len(evolution)} months of data")
        else:
            print("Monthly evolution: empty (no data yet)")
    
    def test_ai_analytics_par_resultat(self, authenticated_headers):
        """Test par_resultat for pie chart data"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/analytics",
            headers=authenticated_headers
        )
        assert response.status_code == 200
        par_resultat = response.json()["par_resultat"]
        
        assert isinstance(par_resultat, list), "par_resultat should be a list"
        # Each item should have id, label, value, color for pie chart
        for item in par_resultat:
            if item.get("value", 0) > 0:
                assert "label" in item, "Pie chart item should have 'label'"
                assert "value" in item, "Pie chart item should have 'value'"
        print(f"Par resultat: {len(par_resultat)} result types")


class TestAIAlertsEndpoint:
    """Test GET /api/surveillance/ai/alerts endpoint (Phase 4)"""
    
    def test_ai_alerts_endpoint_exists(self, authenticated_headers):
        """Test that alerts endpoint exists and returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/alerts",
            headers=authenticated_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "count" in data, "Response should contain 'count'"
        assert "alerts" in data, "Response should contain 'alerts'"
        assert isinstance(data["alerts"], list), "'alerts' should be a list"
        print(f"Alerts endpoint OK - {data['count']} alert(s)")
    
    def test_ai_alerts_structure(self, authenticated_headers):
        """Test that alerts have correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/alerts",
            headers=authenticated_headers
        )
        assert response.status_code == 200
        alerts = response.json()["alerts"]
        
        if len(alerts) > 0:
            alert = alerts[0]
            assert "type" in alert, "Alert should have 'type'"
            assert "severity" in alert, "Alert should have 'severity'"
            assert "title" in alert, "Alert should have 'title'"
            assert "details" in alert, "Alert should have 'details'"
            # Severity should be HAUTE, MOYENNE, or BASSE
            assert alert["severity"] in ["HAUTE", "MOYENNE", "BASSE"], f"Invalid severity: {alert['severity']}"
            print(f"Alert structure OK: {alert['type']} - {alert['severity']}")
        else:
            print("No alerts to verify structure")
    
    def test_ai_alerts_types(self, authenticated_headers):
        """Test that alert types are valid"""
        response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/alerts",
            headers=authenticated_headers
        )
        assert response.status_code == 200
        alerts = response.json()["alerts"]
        
        valid_types = ["degradation", "low_conformity", "missing_wo"]
        for alert in alerts:
            assert alert["type"] in valid_types, f"Invalid alert type: {alert['type']}"
        print(f"All {len(alerts)} alerts have valid types")


class TestAIBatchCreationArchiving:
    """Test that POST /api/surveillance/ai/create-batch archives to ai_analysis_history"""
    
    def test_batch_creation_archives_analysis(self, authenticated_headers):
        """Test that batch creation archives the analysis"""
        # Create a mock analysis batch
        test_data = {
            "filename": "TEST_batch_archive_test.pdf",
            "document_info": {
                "organisme_controle": "TEST_ORGANISME",
                "date_intervention": "2026-01-15",
                "numero_rapport": "TEST-RPT-001",
                "site_controle": "TEST Site"
            },
            "controles": [
                {
                    "classe_type": "TEST Contrôle Archive Test",
                    "category": "ELECTRIQUE",
                    "batiment": "TEST Bâtiment",
                    "periodicite": "1 an",
                    "executant": "TEST Organisme",
                    "description": "Test control for archive verification",
                    "derniere_visite": "2026-01-15",
                    "resultat": "CONFORME"
                }
            ]
        }
        
        # Create batch
        response = requests.post(
            f"{BASE_URL}/api/surveillance/ai/create-batch",
            json=test_data,
            headers=authenticated_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        result = response.json()
        
        # Check that analysis_id is returned (means it was archived)
        assert "analysis_id" in result, "Response should include 'analysis_id'"
        assert result["created_count"] > 0, "Should have created at least 1 item"
        
        analysis_id = result["analysis_id"]
        print(f"Batch created with analysis_id: {analysis_id}")
        
        # Verify the analysis is in history
        history_response = requests.get(
            f"{BASE_URL}/api/surveillance/ai/history/{analysis_id}",
            headers=authenticated_headers
        )
        assert history_response.status_code == 200, "Should find the archived analysis"
        history_data = history_response.json()
        
        assert history_data["filename"] == "TEST_batch_archive_test.pdf"
        assert history_data["organisme_controle"] == "TEST_ORGANISME"
        assert history_data["controles_count"] == 1
        assert history_data["conformes_count"] == 1
        print("Archive verification OK - analysis properly stored in history")
        
        # Store analysis_id for cleanup
        self.analysis_id = analysis_id
        self.created_item_ids = result.get("created_items", [])
    
    @pytest.fixture(autouse=True)
    def cleanup_test_data(self, authenticated_headers):
        """Cleanup test data after tests"""
        yield
        # Cleanup would be done by directly removing from MongoDB
        # For now, we prefix test data with TEST_ for easy identification


class TestCleanupTestData:
    """Cleanup test data created during tests"""
    
    def test_cleanup_test_surveillance_items(self, authenticated_headers):
        """Remove TEST_ prefixed surveillance items"""
        # Get all items
        response = requests.get(
            f"{BASE_URL}/api/surveillance/items",
            headers=authenticated_headers
        )
        if response.status_code == 200:
            items = response.json()
            for item in items:
                if item.get("classe_type", "").startswith("TEST"):
                    # Delete the item
                    requests.delete(
                        f"{BASE_URL}/api/surveillance/items/{item['id']}",
                        headers=authenticated_headers
                    )
                    print(f"Cleaned up: {item['id']}")
        print("Cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
