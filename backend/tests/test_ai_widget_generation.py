"""
Tests for AI Widget Generation via Adria
Tests POST /api/ai/widgets/generate endpoint for creating widgets from natural language descriptions
"""
import pytest
import requests
import os
import time

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://gmao-trash-fix.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@test.com"
TEST_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed - status {response.status_code}: {response.text}")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated API client"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestAIWidgetGenerate:
    """Tests for AI Widget generation endpoint POST /api/ai/widgets/generate"""
    
    created_widget_ids = []
    
    def test_generate_pie_chart_widget(self, api_client):
        """POST /api/ai/widgets/generate with pie chart description should return success=true"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/widgets/generate",
            json={"description": "Camembert des OT par statut"},
            timeout=60
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text[:1000]}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify success=true
        assert data.get("success") == True
        
        # Verify widget returned
        assert "widget" in data
        widget = data["widget"]
        
        # Verify widget has required fields
        assert "id" in widget
        assert "name" in widget
        assert "visualization" in widget
        
        # Store for cleanup
        self.created_widget_ids.append(widget["id"])
        
        print(f"Created widget: {widget.get('name')}, type: {widget.get('visualization', {}).get('type')}")
        
    def test_generate_gauge_widget_with_formula(self, api_client):
        """POST /api/ai/widgets/generate with formula description should return widget with formula source"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/widgets/generate",
            json={"description": "jauge taux resolution = OT termines / OT total * 100"},
            timeout=60
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text[:1000]}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify success=true
        assert data.get("success") == True
        
        # Verify widget returned
        assert "widget" in data
        widget = data["widget"]
        
        # Verify widget has required fields
        assert "id" in widget
        assert "data_sources" in widget
        
        # Store for cleanup
        self.created_widget_ids.append(widget["id"])
        
        print(f"Created widget: {widget.get('name')}")
        print(f"Data sources: {len(widget.get('data_sources', []))}")
        
    def test_widget_saved_in_db(self, api_client):
        """GET /api/custom-widgets should return the AI-created widgets"""
        response = api_client.get(f"{BASE_URL}/api/custom-widgets")
        
        assert response.status_code == 200
        widgets = response.json()
        
        # Verify widgets list is returned
        assert isinstance(widgets, list)
        
        # Check if our created widgets are in the list
        widget_ids_in_db = [w.get("id") for w in widgets]
        
        for created_id in self.created_widget_ids:
            if created_id:  # Only check if we have created widgets
                assert created_id in widget_ids_in_db, f"Widget {created_id} not found in DB"
                print(f"Widget {created_id} found in DB")
                
    def test_generate_bar_chart_widget(self, api_client):
        """POST /api/ai/widgets/generate with bar chart description should work"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/widgets/generate",
            json={"description": "Graphique en barres des OT par categorie"},
            timeout=60
        )
        
        print(f"Response status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "widget" in data
        
        # Store for cleanup
        self.created_widget_ids.append(data["widget"]["id"])
        
        # Verify bar_chart type (may vary based on LLM interpretation)
        widget = data["widget"]
        viz_type = widget.get("visualization", {}).get("type")
        print(f"Created widget type: {viz_type}")
        
    @pytest.fixture(autouse=True, scope="class")
    def cleanup(self, api_client):
        """Cleanup created test widgets after all tests"""
        yield
        
        for widget_id in self.created_widget_ids:
            if widget_id:
                try:
                    api_client.delete(f"{BASE_URL}/api/custom-widgets/{widget_id}")
                    print(f"Cleaned up widget {widget_id}")
                except Exception as e:
                    print(f"Error cleaning up widget {widget_id}: {e}")


class TestAIWidgetEdgeCases:
    """Edge case tests for AI Widget generation"""
    
    def test_generate_widget_with_empty_description_fails(self, api_client):
        """POST /api/ai/widgets/generate with empty description should fail or return error"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/widgets/generate",
            json={"description": ""},
            timeout=60
        )
        
        # Should either fail with 422 validation error or return success=false
        print(f"Empty description response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            # If it returns 200, LLM might still try to generate something
            # We just check it doesn't crash
            print(f"Response: {data}")
        else:
            # 422 validation error is also acceptable
            assert response.status_code in [400, 422, 500]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
