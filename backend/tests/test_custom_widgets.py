"""
Tests for Custom Widgets API
Tests CRUD operations, GMAO data types, and widget refresh functionality
"""
import pytest
import requests
import os
import uuid

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://widget-excel-upload.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@test.com"
TEST_PASSWORD = "password"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping tests")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated API client"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestGmaoDataTypes:
    """Tests for GMAO data types endpoint"""
    
    def test_get_gmao_data_types_returns_26_types(self, api_client):
        """GET /api/custom-widgets/data-types/gmao should return 26 data types"""
        response = api_client.get(f"{BASE_URL}/api/custom-widgets/data-types/gmao")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 26
        
    def test_gmao_data_types_have_required_fields(self, api_client):
        """Each GMAO data type should have type, label, category, returns fields"""
        response = api_client.get(f"{BASE_URL}/api/custom-widgets/data-types/gmao")
        
        assert response.status_code == 200
        data = response.json()
        
        for dt in data:
            assert "type" in dt
            assert "label" in dt
            assert "category" in dt
            assert "returns" in dt
            
    def test_gmao_data_types_include_work_orders_completion_rate(self, api_client):
        """GMAO data types should include work_orders_completion_rate"""
        response = api_client.get(f"{BASE_URL}/api/custom-widgets/data-types/gmao")
        
        assert response.status_code == 200
        data = response.json()
        
        types = [dt["type"] for dt in data]
        assert "work_orders_completion_rate" in types


class TestWidgetCRUD:
    """Tests for Widget CRUD operations"""
    
    @pytest.fixture
    def test_widget_data(self):
        """Test widget data with GMAO source"""
        return {
            "name": f"TEST_Widget_{uuid.uuid4().hex[:8]}",
            "description": "Test widget for automated testing",
            "data_sources": [
                {
                    "id": "source_test_1",
                    "name": "Taux OT",
                    "type": "gmao",
                    "gmao_config": {
                        "data_type": "work_orders_completion_rate"
                    }
                }
            ],
            "primary_source_id": "source_test_1",
            "visualization": {
                "title": "Test Widget",
                "subtitle": "Test subtitle",
                "type": "gauge",
                "unit": "%",
                "min_value": 0,
                "max_value": 100,
                "size": "medium",
                "color_scheme": "blue"
            },
            "refresh_interval": 5,
            "is_shared": False,
            "shared_with_roles": []
        }
    
    def test_create_widget_with_gmao_source(self, api_client, test_widget_data):
        """POST /api/custom-widgets should create a widget with GMAO source"""
        response = api_client.post(
            f"{BASE_URL}/api/custom-widgets",
            json=test_widget_data
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert data["name"] == test_widget_data["name"]
        assert len(data["data_sources"]) == 1
        assert data["data_sources"][0]["type"] == "gmao"
        assert data["data_sources"][0]["gmao_config"]["data_type"] == "work_orders_completion_rate"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/custom-widgets/{data['id']}")
        
    def test_get_widgets_returns_list(self, api_client):
        """GET /api/custom-widgets should return a list"""
        response = api_client.get(f"{BASE_URL}/api/custom-widgets")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
    def test_get_widget_by_id(self, api_client, test_widget_data):
        """GET /api/custom-widgets/{id} should return the widget"""
        # Create widget first
        create_response = api_client.post(
            f"{BASE_URL}/api/custom-widgets",
            json=test_widget_data
        )
        assert create_response.status_code == 200
        widget_id = create_response.json()["id"]
        
        # Get widget by ID
        response = api_client.get(f"{BASE_URL}/api/custom-widgets/{widget_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == widget_id
        assert data["name"] == test_widget_data["name"]
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/custom-widgets/{widget_id}")
        
    def test_refresh_widget_updates_cached_value(self, api_client, test_widget_data):
        """POST /api/custom-widgets/{id}/refresh should update cached_value"""
        # Create widget first
        create_response = api_client.post(
            f"{BASE_URL}/api/custom-widgets",
            json=test_widget_data
        )
        assert create_response.status_code == 200
        widget_id = create_response.json()["id"]
        
        # Refresh widget
        response = api_client.post(f"{BASE_URL}/api/custom-widgets/{widget_id}/refresh")
        
        assert response.status_code == 200
        data = response.json()
        assert "widget" in data
        assert data["widget"]["data_sources"][0]["cached_value"] is not None
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/custom-widgets/{widget_id}")
        
    def test_delete_widget(self, api_client, test_widget_data):
        """DELETE /api/custom-widgets/{id} should delete the widget"""
        # Create widget first
        create_response = api_client.post(
            f"{BASE_URL}/api/custom-widgets",
            json=test_widget_data
        )
        assert create_response.status_code == 200
        widget_id = create_response.json()["id"]
        
        # Delete widget
        response = api_client.delete(f"{BASE_URL}/api/custom-widgets/{widget_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == widget_id
        
        # Verify deletion
        get_response = api_client.get(f"{BASE_URL}/api/custom-widgets/{widget_id}")
        assert get_response.status_code == 404


class TestExcelConnection:
    """Tests for Excel SMB connection (MOCKED)"""
    
    def test_excel_connection_returns_error_for_invalid_path(self, api_client):
        """POST /api/custom-widgets/test/excel-connection should return error for invalid SMB path"""
        response = api_client.post(
            f"{BASE_URL}/api/custom-widgets/test/excel-connection",
            params={"smb_path": "\\\\invalid\\path\\file.xlsx"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == False
        assert "error" in data


class TestWidgetUpdate:
    """Tests for Widget update operations"""
    
    @pytest.fixture
    def created_widget(self, api_client):
        """Create a widget for update tests"""
        widget_data = {
            "name": f"TEST_Update_Widget_{uuid.uuid4().hex[:8]}",
            "description": "Widget for update testing",
            "data_sources": [
                {
                    "id": "source_1",
                    "name": "Source 1",
                    "type": "manual",
                    "manual_value": 50
                }
            ],
            "primary_source_id": "source_1",
            "visualization": {
                "title": "Update Test",
                "type": "value",
                "size": "small",
                "color_scheme": "green"
            },
            "refresh_interval": 5,
            "is_shared": False,
            "shared_with_roles": []
        }
        
        response = api_client.post(f"{BASE_URL}/api/custom-widgets", json=widget_data)
        assert response.status_code == 200
        widget = response.json()
        
        yield widget
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/custom-widgets/{widget['id']}")
        
    def test_update_widget_name(self, api_client, created_widget):
        """PUT /api/custom-widgets/{id} should update widget name"""
        new_name = f"TEST_Updated_Name_{uuid.uuid4().hex[:8]}"
        
        response = api_client.put(
            f"{BASE_URL}/api/custom-widgets/{created_widget['id']}",
            json={"name": new_name}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == new_name
        
        # Verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/custom-widgets/{created_widget['id']}")
        assert get_response.status_code == 200
        assert get_response.json()["name"] == new_name


class TestWidgetWithManualSource:
    """Tests for widgets with manual value source"""
    
    def test_create_widget_with_manual_source(self, api_client):
        """Create widget with manual value source"""
        widget_data = {
            "name": f"TEST_Manual_Widget_{uuid.uuid4().hex[:8]}",
            "description": "Widget with manual value",
            "data_sources": [
                {
                    "id": "manual_source",
                    "name": "Manual Value",
                    "type": "manual",
                    "manual_value": 75.5
                }
            ],
            "primary_source_id": "manual_source",
            "visualization": {
                "title": "Manual Value Widget",
                "type": "value",
                "size": "small",
                "color_scheme": "purple"
            },
            "refresh_interval": 5,
            "is_shared": False,
            "shared_with_roles": []
        }
        
        response = api_client.post(f"{BASE_URL}/api/custom-widgets", json=widget_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["data_sources"][0]["type"] == "manual"
        assert data["data_sources"][0]["manual_value"] == 75.5
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/custom-widgets/{data['id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
