"""
Tests for Surveillance Batch Trends API - POST /api/surveillance/batch-trends
Tests the trend calculation for recurring controls compliance history
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://gmao-maintenance.preview.emergentagent.com').rstrip('/')


class TestSurveillanceBatchTrendsAPI:
    """Test the batch-trends endpoint for compliance trend calculation"""
    
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
    def authenticated_client(self, auth_token):
        """Session with auth header"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session

    def test_batch_trends_endpoint_exists(self, authenticated_client):
        """Test that batch-trends endpoint exists and returns 200"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/surveillance/batch-trends",
            json={"groupe_controle_ids": [], "current_year": 2026}
        )
        assert response.status_code == 200, f"Endpoint failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert "trends" in data

    def test_batch_trends_with_empty_ids(self, authenticated_client):
        """Test that empty ids list returns empty trends"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/surveillance/batch-trends",
            json={"groupe_controle_ids": [], "current_year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("trends") == {}
        print("Empty ids correctly returns empty trends")

    def test_batch_trends_with_valid_ids(self, authenticated_client):
        """Test batch-trends returns correct trend data for valid groupe_controle_ids"""
        # First get groupe_controle_ids from existing items
        items_response = authenticated_client.get(f"{BASE_URL}/api/surveillance/items", params={"annee": 2026})
        assert items_response.status_code == 200
        items = items_response.json()
        
        groupe_ids = list(set(i.get("groupe_controle_id") for i in items if i.get("groupe_controle_id")))
        assert len(groupe_ids) > 0, "No items with groupe_controle_id found"
        print(f"Found {len(groupe_ids)} unique groupe_controle_ids")
        
        # Call batch-trends
        response = authenticated_client.post(
            f"{BASE_URL}/api/surveillance/batch-trends",
            json={"groupe_controle_ids": groupe_ids[:10], "current_year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert isinstance(data.get("trends"), dict)
        
        trends = data["trends"]
        print(f"Trends returned for {len(trends)} groups")
        
        # Verify structure of each trend
        for gid, trend_data in trends.items():
            assert "trend" in trend_data, f"Missing 'trend' in trend data for {gid}"
            assert "realized" in trend_data, f"Missing 'realized' in trend data for {gid}"
            assert "total" in trend_data, f"Missing 'total' in trend data for {gid}"
            assert trend_data["trend"] in ["up", "stable", "down", "none"], f"Invalid trend value: {trend_data['trend']}"
            print(f"  - {gid[:8]}...: trend={trend_data['trend']}, {trend_data['realized']}/{trend_data['total']} realized")

    def test_batch_trends_trend_values(self, authenticated_client):
        """Test that trend values follow the correct logic"""
        # Get items from 2026 (current year per test request)
        items_response = authenticated_client.get(f"{BASE_URL}/api/surveillance/items", params={"annee": 2026})
        items = items_response.json()
        
        groupe_ids = list(set(i.get("groupe_controle_id") for i in items if i.get("groupe_controle_id")))
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/surveillance/batch-trends",
            json={"groupe_controle_ids": groupe_ids, "current_year": 2026}
        )
        data = response.json()
        trends = data.get("trends", {})
        
        # Check trend calculation logic
        # up: ratio >= 0.8
        # stable: 0.5 <= ratio < 0.8
        # down: ratio < 0.5
        # none: no past data
        for gid, trend_data in trends.items():
            trend = trend_data["trend"]
            realized = trend_data["realized"]
            total = trend_data["total"]
            
            if total == 0:
                assert trend == "none", f"Expected 'none' when total=0, got '{trend}'"
            else:
                ratio = realized / total
                if ratio >= 0.8:
                    assert trend == "up", f"Expected 'up' for ratio {ratio}, got '{trend}'"
                elif ratio >= 0.5:
                    assert trend == "stable", f"Expected 'stable' for ratio {ratio}, got '{trend}'"
                else:
                    assert trend == "down", f"Expected 'down' for ratio {ratio}, got '{trend}'"
        
        print("All trend calculations verified correct")

    def test_batch_trends_with_different_year(self, authenticated_client):
        """Test batch-trends with different current_year parameter"""
        items_response = authenticated_client.get(f"{BASE_URL}/api/surveillance/items", params={"annee": 2026})
        items = items_response.json()
        groupe_ids = list(set(i.get("groupe_controle_id") for i in items if i.get("groupe_controle_id")))[:5]
        
        # Call with 2025 as current year - should have no past data
        response_2025 = authenticated_client.post(
            f"{BASE_URL}/api/surveillance/batch-trends",
            json={"groupe_controle_ids": groupe_ids, "current_year": 2025}
        )
        assert response_2025.status_code == 200
        data_2025 = response_2025.json()
        
        # Call with 2026 as current year - should see 2025 as past
        response_2026 = authenticated_client.post(
            f"{BASE_URL}/api/surveillance/batch-trends",
            json={"groupe_controle_ids": groupe_ids, "current_year": 2026}
        )
        assert response_2026.status_code == 200
        data_2026 = response_2026.json()
        
        print(f"2025 current year: {len(data_2025.get('trends', {}))} trends computed")
        print(f"2026 current year: {len(data_2026.get('trends', {}))} trends computed")
        
        # The trends should potentially differ based on past data availability
        for gid in groupe_ids:
            trend_2025 = data_2025.get("trends", {}).get(gid, {})
            trend_2026 = data_2026.get("trends", {}).get(gid, {})
            if trend_2025 or trend_2026:
                print(f"  {gid[:8]}...: 2025={trend_2025.get('trend', 'N/A')}, 2026={trend_2026.get('trend', 'N/A')}")

    def test_batch_trends_with_invalid_id(self, authenticated_client):
        """Test that invalid groupe_controle_id is handled gracefully"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/surveillance/batch-trends",
            json={"groupe_controle_ids": ["invalid-id-12345"], "current_year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        # Invalid ID should just not appear in trends or have no data
        trends = data.get("trends", {})
        print(f"Invalid ID handled: trends contains {len(trends)} entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
