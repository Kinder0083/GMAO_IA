"""
Test suite for Cameras RTSP/ONVIF feature (P3)
Tests all camera CRUD operations, snapshot, streaming, and settings endpoints
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://equipment-hierarchy.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "password"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access_token in response"
    return data["access_token"]


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestCamerasCRUD:
    """Test Camera CRUD operations"""
    
    created_camera_id = None
    
    def test_list_cameras(self, api_client):
        """GET /api/cameras - List all cameras"""
        response = api_client.get(f"{BASE_URL}/api/cameras")
        assert response.status_code == 200, f"Failed to list cameras: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Found {len(data)} cameras")
        
        # Verify camera structure if any exist
        if len(data) > 0:
            camera = data[0]
            assert "id" in camera, "Camera should have id"
            assert "name" in camera, "Camera should have name"
            assert "rtsp_url" in camera, "Camera should have rtsp_url"
            assert "is_online" in camera, "Camera should have is_online status"
            print(f"   First camera: {camera['name']} (online: {camera['is_online']})")
    
    def test_get_cameras_count(self, api_client):
        """GET /api/cameras/count - Get camera statistics"""
        response = api_client.get(f"{BASE_URL}/api/cameras/count")
        assert response.status_code == 200, f"Failed to get camera count: {response.text}"
        
        data = response.json()
        assert "total" in data, "Response should have total"
        assert "online" in data, "Response should have online count"
        assert "offline" in data, "Response should have offline count"
        assert "active_streams" in data, "Response should have active_streams"
        assert "max_streams" in data, "Response should have max_streams"
        assert data["max_streams"] == 3, "Max streams should be 3"
        
        print(f"✅ Camera stats: total={data['total']}, online={data['online']}, offline={data['offline']}, streams={data['active_streams']}/3")
    
    def test_create_camera(self, api_client):
        """POST /api/cameras - Create a new camera"""
        camera_data = {
            "name": "TEST_Camera_Pytest",
            "rtsp_url": "rtsp://192.168.1.100:554/stream1",
            "username": "admin",
            "password": "testpass",
            "brand": "hikvision",
            "location": "Test Location"
        }
        
        response = api_client.post(f"{BASE_URL}/api/cameras", json=camera_data)
        assert response.status_code == 200, f"Failed to create camera: {response.text}"
        
        data = response.json()
        assert "id" in data, "Created camera should have id"
        assert data["name"] == camera_data["name"], "Name should match"
        assert data["rtsp_url"] == camera_data["rtsp_url"], "RTSP URL should match"
        assert data["brand"] == camera_data["brand"], "Brand should match"
        assert data["location"] == camera_data["location"], "Location should match"
        
        TestCamerasCRUD.created_camera_id = data["id"]
        print(f"✅ Created camera: {data['name']} (id: {data['id']})")
    
    def test_get_camera_by_id(self, api_client):
        """GET /api/cameras/{id} - Get camera by ID"""
        if not TestCamerasCRUD.created_camera_id:
            pytest.skip("No camera created to test")
        
        response = api_client.get(f"{BASE_URL}/api/cameras/{TestCamerasCRUD.created_camera_id}")
        assert response.status_code == 200, f"Failed to get camera: {response.text}"
        
        data = response.json()
        assert data["id"] == TestCamerasCRUD.created_camera_id, "ID should match"
        assert data["name"] == "TEST_Camera_Pytest", "Name should match"
        print(f"✅ Retrieved camera: {data['name']}")
    
    def test_update_camera(self, api_client):
        """PUT /api/cameras/{id} - Update a camera"""
        if not TestCamerasCRUD.created_camera_id:
            pytest.skip("No camera created to test")
        
        update_data = {
            "name": "TEST_Camera_Pytest_Updated",
            "location": "Updated Location"
        }
        
        response = api_client.put(
            f"{BASE_URL}/api/cameras/{TestCamerasCRUD.created_camera_id}",
            json=update_data
        )
        assert response.status_code == 200, f"Failed to update camera: {response.text}"
        
        data = response.json()
        assert data["name"] == update_data["name"], "Name should be updated"
        assert data["location"] == update_data["location"], "Location should be updated"
        print(f"✅ Updated camera: {data['name']}")
    
    def test_test_camera_connection(self, api_client):
        """POST /api/cameras/{id}/test - Test camera connection"""
        if not TestCamerasCRUD.created_camera_id:
            pytest.skip("No camera created to test")
        
        response = api_client.post(f"{BASE_URL}/api/cameras/{TestCamerasCRUD.created_camera_id}/test")
        assert response.status_code == 200, f"Failed to test camera: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should have success field"
        assert "message" in data, "Response should have message field"
        
        # Note: With fictitious IP, connection will fail - this is expected
        print(f"✅ Test connection result: success={data['success']}, message={data['message']}")
    
    def test_get_camera_snapshot(self, api_client):
        """GET /api/cameras/{id}/snapshot - Capture snapshot (base64)"""
        if not TestCamerasCRUD.created_camera_id:
            pytest.skip("No camera created to test")
        
        response = api_client.get(f"{BASE_URL}/api/cameras/{TestCamerasCRUD.created_camera_id}/snapshot")
        assert response.status_code == 200, f"Failed to get snapshot: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should have success field"
        
        # Note: With fictitious IP, snapshot will fail - this is expected
        if data["success"]:
            assert "snapshot" in data, "Successful response should have snapshot"
            print(f"✅ Snapshot captured successfully")
        else:
            print(f"✅ Snapshot endpoint works (camera offline as expected): {data.get('message', 'No message')}")
    
    def test_start_stream(self, api_client):
        """POST /api/cameras/{id}/stream/start - Start HLS stream"""
        if not TestCamerasCRUD.created_camera_id:
            pytest.skip("No camera created to test")
        
        response = api_client.post(f"{BASE_URL}/api/cameras/{TestCamerasCRUD.created_camera_id}/stream/start")
        assert response.status_code == 200, f"Failed to start stream: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should have success field"
        assert "active_streams" in data, "Response should have active_streams count"
        
        # Note: With fictitious IP, stream may fail - this is expected
        if data["success"]:
            assert "stream_url" in data, "Successful response should have stream_url"
            print(f"✅ Stream started: {data['stream_url']}")
        else:
            print(f"✅ Stream endpoint works (may fail with fictitious IP): {data.get('message', 'No message')}")
    
    def test_stop_stream(self, api_client):
        """POST /api/cameras/{id}/stream/stop - Stop HLS stream"""
        if not TestCamerasCRUD.created_camera_id:
            pytest.skip("No camera created to test")
        
        response = api_client.post(f"{BASE_URL}/api/cameras/{TestCamerasCRUD.created_camera_id}/stream/stop")
        assert response.status_code == 200, f"Failed to stop stream: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should have success field"
        assert "active_streams" in data, "Response should have active_streams count"
        print(f"✅ Stream stopped: success={data['success']}, active_streams={data['active_streams']}")
    
    def test_delete_camera(self, api_client):
        """DELETE /api/cameras/{id} - Delete a camera"""
        if not TestCamerasCRUD.created_camera_id:
            pytest.skip("No camera created to test")
        
        response = api_client.delete(f"{BASE_URL}/api/cameras/{TestCamerasCRUD.created_camera_id}")
        assert response.status_code == 200, f"Failed to delete camera: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Delete should return success=True"
        print(f"✅ Camera deleted successfully")
        
        # Verify deletion
        response = api_client.get(f"{BASE_URL}/api/cameras/{TestCamerasCRUD.created_camera_id}")
        assert response.status_code == 404, "Deleted camera should return 404"
        print(f"✅ Verified camera no longer exists")


class TestCameraSettings:
    """Test Camera Settings endpoints"""
    
    def test_get_snapshot_settings(self, api_client):
        """GET /api/cameras/settings/snapshot - Get snapshot settings"""
        response = api_client.get(f"{BASE_URL}/api/cameras/settings/snapshot")
        assert response.status_code == 200, f"Failed to get settings: {response.text}"
        
        data = response.json()
        assert "snapshot_frequency_seconds" in data, "Should have snapshot_frequency_seconds"
        assert "retention_days" in data, "Should have retention_days"
        assert "retention_max_count" in data, "Should have retention_max_count"
        assert "storage_path" in data, "Should have storage_path"
        
        print(f"✅ Snapshot settings: frequency={data['snapshot_frequency_seconds']}s, retention={data['retention_days']} days, max={data['retention_max_count']}")
    
    def test_update_snapshot_settings(self, api_client):
        """PUT /api/cameras/settings/snapshot - Update snapshot settings"""
        # First get current settings
        response = api_client.get(f"{BASE_URL}/api/cameras/settings/snapshot")
        original_settings = response.json()
        
        # Update settings
        update_data = {
            "snapshot_frequency_seconds": 60,
            "retention_days": 14
        }
        
        response = api_client.put(f"{BASE_URL}/api/cameras/settings/snapshot", json=update_data)
        assert response.status_code == 200, f"Failed to update settings: {response.text}"
        
        data = response.json()
        assert data["snapshot_frequency_seconds"] == 60, "Frequency should be updated"
        assert data["retention_days"] == 14, "Retention days should be updated"
        print(f"✅ Settings updated: frequency={data['snapshot_frequency_seconds']}s, retention={data['retention_days']} days")
        
        # Restore original settings
        restore_data = {
            "snapshot_frequency_seconds": original_settings["snapshot_frequency_seconds"],
            "retention_days": original_settings["retention_days"]
        }
        api_client.put(f"{BASE_URL}/api/cameras/settings/snapshot", json=restore_data)
        print(f"✅ Settings restored to original values")


class TestOnvifDiscovery:
    """Test ONVIF Discovery endpoints"""
    
    def test_discover_onvif(self, api_client):
        """GET /api/cameras/discover/onvif - ONVIF discovery"""
        # Note: This will likely return empty in test environment without real cameras
        response = api_client.get(f"{BASE_URL}/api/cameras/discover/onvif?timeout=5")
        assert response.status_code == 200, f"Failed to discover ONVIF: {response.text}"
        
        data = response.json()
        assert "count" in data, "Response should have count"
        assert "cameras" in data, "Response should have cameras list"
        assert isinstance(data["cameras"], list), "Cameras should be a list"
        
        print(f"✅ ONVIF discovery: found {data['count']} cameras")
        if data["count"] > 0:
            for cam in data["cameras"]:
                print(f"   - {cam.get('ip', 'Unknown IP')} ({cam.get('brand', 'Unknown brand')})")


class TestCameraValidation:
    """Test Camera validation and error handling"""
    
    def test_create_camera_missing_name(self, api_client):
        """POST /api/cameras - Should fail without name"""
        camera_data = {
            "rtsp_url": "rtsp://192.168.1.100:554/stream1"
        }
        
        response = api_client.post(f"{BASE_URL}/api/cameras", json=camera_data)
        assert response.status_code == 422, f"Should return 422 for missing name: {response.status_code}"
        print(f"✅ Validation works: missing name returns 422")
    
    def test_create_camera_missing_rtsp_url(self, api_client):
        """POST /api/cameras - Should fail without rtsp_url"""
        camera_data = {
            "name": "Test Camera"
        }
        
        response = api_client.post(f"{BASE_URL}/api/cameras", json=camera_data)
        assert response.status_code == 422, f"Should return 422 for missing rtsp_url: {response.status_code}"
        print(f"✅ Validation works: missing rtsp_url returns 422")
    
    def test_create_camera_duplicate_name(self, api_client):
        """POST /api/cameras - Should fail with duplicate name"""
        # First create a camera
        camera_data = {
            "name": "TEST_Duplicate_Name_Camera",
            "rtsp_url": "rtsp://192.168.1.100:554/stream1"
        }
        
        response = api_client.post(f"{BASE_URL}/api/cameras", json=camera_data)
        assert response.status_code == 200, f"Failed to create first camera: {response.text}"
        camera_id = response.json()["id"]
        
        # Try to create another with same name
        response = api_client.post(f"{BASE_URL}/api/cameras", json=camera_data)
        assert response.status_code == 400, f"Should return 400 for duplicate name: {response.status_code}"
        print(f"✅ Validation works: duplicate name returns 400")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/cameras/{camera_id}")
    
    def test_get_nonexistent_camera(self, api_client):
        """GET /api/cameras/{id} - Should return 404 for non-existent camera"""
        response = api_client.get(f"{BASE_URL}/api/cameras/000000000000000000000000")
        assert response.status_code == 404, f"Should return 404: {response.status_code}"
        print(f"✅ Returns 404 for non-existent camera")


class TestCameraTestUrl:
    """Test camera URL testing endpoint"""
    
    def test_test_url_endpoint(self, api_client):
        """POST /api/cameras/test-url - Test RTSP URL without creating camera"""
        params = {
            "rtsp_url": "rtsp://192.168.1.100:554/stream1",
            "username": "admin",
            "password": "test"
        }
        
        response = api_client.post(f"{BASE_URL}/api/cameras/test-url", params=params)
        assert response.status_code == 200, f"Failed to test URL: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should have success field"
        assert "message" in data, "Response should have message field"
        
        # Note: With fictitious IP, connection will fail - this is expected
        print(f"✅ Test URL endpoint works: success={data['success']}, message={data['message']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
