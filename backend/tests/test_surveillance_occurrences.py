"""
Tests for Surveillance Recurrence/Occurrences API
Tests the GET /api/surveillance/occurrences/{groupe_controle_id} endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://gmao-trash-fix.preview.emergentagent.com').rstrip('/')


class TestSurveillanceOccurrencesAPI:
    """Test the occurrences endpoint for recurring surveillance controls"""
    
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

    def test_get_surveillance_items_have_groupe_controle_id(self, authenticated_client):
        """Test that surveillance items have groupe_controle_id field"""
        response = authenticated_client.get(f"{BASE_URL}/api/surveillance/items", params={"annee": 2025})
        assert response.status_code == 200
        
        items = response.json()
        assert isinstance(items, list)
        
        # Check that items have groupe_controle_id
        items_with_groupe = [i for i in items if i.get("groupe_controle_id")]
        print(f"Total items: {len(items)}, Items with groupe_controle_id: {len(items_with_groupe)}")
        assert len(items_with_groupe) > 0, "No items found with groupe_controle_id"
    
    def test_occurrences_endpoint_returns_correct_data(self, authenticated_client):
        """Test that occurrences endpoint returns correct structure"""
        # First get a groupe_controle_id
        response = authenticated_client.get(f"{BASE_URL}/api/surveillance/items", params={"annee": 2025})
        assert response.status_code == 200
        items = response.json()
        
        items_with_groupe = [i for i in items if i.get("groupe_controle_id")]
        assert len(items_with_groupe) > 0, "No items with groupe_controle_id found"
        
        groupe_id = items_with_groupe[0]["groupe_controle_id"]
        
        # Call the occurrences endpoint
        occ_response = authenticated_client.get(f"{BASE_URL}/api/surveillance/occurrences/{groupe_id}")
        assert occ_response.status_code == 200
        
        data = occ_response.json()
        assert data.get("success") == True
        assert "occurrences" in data
        assert "total" in data
        assert isinstance(data["occurrences"], list)
        print(f"Occurrences found: {data['total']}")
    
    def test_occurrences_have_required_fields(self, authenticated_client):
        """Test that each occurrence has required fields for RecurrenceIndicator"""
        # Get a groupe_controle_id
        response = authenticated_client.get(f"{BASE_URL}/api/surveillance/items", params={"annee": 2025})
        items = response.json()
        items_with_groupe = [i for i in items if i.get("groupe_controle_id")]
        groupe_id = items_with_groupe[0]["groupe_controle_id"]
        
        # Get occurrences
        occ_response = authenticated_client.get(f"{BASE_URL}/api/surveillance/occurrences/{groupe_id}")
        data = occ_response.json()
        
        # RecurrenceIndicator expects: id, annee, prochain_controle, status, date_realisation
        required_fields = ["id", "annee", "prochain_controle", "status"]
        
        for occ in data["occurrences"]:
            for field in required_fields:
                assert field in occ, f"Missing required field: {field}"
            # annee should be int
            assert isinstance(occ["annee"], int), f"annee should be int, got {type(occ['annee'])}"
            print(f"  - Year {occ['annee']}: {occ['prochain_controle']} - {occ['status']}")
    
    def test_occurrences_span_multiple_years(self, authenticated_client):
        """Test that recurring controls have occurrences across multiple years"""
        # Get a groupe_controle_id for a recurring control
        response = authenticated_client.get(f"{BASE_URL}/api/surveillance/items", params={"annee": 2025})
        items = response.json()
        items_with_groupe = [i for i in items if i.get("groupe_controle_id")]
        groupe_id = items_with_groupe[0]["groupe_controle_id"]
        
        # Get occurrences
        occ_response = authenticated_client.get(f"{BASE_URL}/api/surveillance/occurrences/{groupe_id}")
        data = occ_response.json()
        
        # Check years distribution
        years = set(occ["annee"] for occ in data["occurrences"])
        print(f"Years with occurrences: {sorted(years)}")
        
        # According to test request, data should span 2025-2027
        assert len(years) >= 2, f"Expected occurrences in multiple years, got: {years}"
    
    def test_occurrences_for_invalid_groupe_id(self, authenticated_client):
        """Test that invalid groupe_id returns empty occurrences gracefully"""
        invalid_id = "non-existent-groupe-id-12345"
        response = authenticated_client.get(f"{BASE_URL}/api/surveillance/occurrences/{invalid_id}")
        
        # Should return 200 with empty or success response, not 500
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("total") == 0 or data.get("occurrences") == []
        print("Invalid groupe_id handled correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
