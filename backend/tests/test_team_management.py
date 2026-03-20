"""
Tests for Team Management (P1-3) and Time Tracking APIs
Tests: Team members, Time tracking (clock-in/out, present-at-post, manual entry), Absences, Work rhythms
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://time-entry-mgmt.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "password"
MANAGER_EMAIL = "responsable.maintenance@test.com"
MANAGER_PASSWORD = "password"


class TestAuth:
    """Authentication tests"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "ADMIN"
        print(f"✅ Admin login successful: {data['user']['email']}")
        return data["access_token"]
    
    def test_manager_login(self):
        """Test manager login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200, f"Manager login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print(f"✅ Manager login successful: {data['user']['email']}")
        return data["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def manager_token():
    """Get manager authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": MANAGER_EMAIL,
        "password": MANAGER_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Manager login failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def manager_headers(manager_token):
    """Headers with manager auth"""
    return {
        "Authorization": f"Bearer {manager_token}",
        "Content-Type": "application/json"
    }


class TestWorkRhythms:
    """Test work rhythms API"""
    
    def test_get_work_rhythms(self, admin_headers):
        """GET /api/team/work-rhythms - List available work rhythms"""
        response = requests.get(f"{BASE_URL}/api/team/work-rhythms", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get work rhythms: {response.text}"
        
        rhythms = response.json()
        assert isinstance(rhythms, list)
        assert len(rhythms) >= 7, f"Expected at least 7 default rhythms, got {len(rhythms)}"
        
        # Check for expected default rhythms
        rhythm_codes = [r["code"] for r in rhythms]
        expected_codes = ["journee", "2x8_matin", "2x8_aprem", "3x8_matin", "3x8_aprem", "3x8_nuit", "nuit"]
        for code in expected_codes:
            assert code in rhythm_codes, f"Missing expected rhythm: {code}"
        
        # Verify rhythm structure
        for rhythm in rhythms:
            assert "code" in rhythm
            assert "name" in rhythm
            assert "config" in rhythm
            config = rhythm["config"]
            assert "default_start" in config
            assert "default_end" in config
            assert "break_duration_minutes" in config
            assert "weekly_hours" in config
        
        print(f"✅ Work rhythms retrieved: {len(rhythms)} rhythms")
        return rhythms


class TestTeamMembers:
    """Test team members API"""
    
    def test_get_team_members(self, admin_headers):
        """GET /api/team/members - List team members"""
        response = requests.get(f"{BASE_URL}/api/team/members", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get team members: {response.text}"
        
        members = response.json()
        assert isinstance(members, list)
        print(f"✅ Team members retrieved: {len(members)} members")
        return members
    
    def test_create_temporary_member(self, admin_headers):
        """POST /api/team/members - Create temporary/interim worker"""
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        member_data = {
            "nom": "TEST_Temporaire",
            "prenom": "Intérimaire",
            "service": "Maintenance",
            "poste": "Technicien intérimaire",
            "mission_start": today,
            "mission_end": end_date,
            "work_rhythm": "journee",
            "competences": ["Électricité", "Mécanique"],
            "notes": "Test intérimaire créé par pytest"
        }
        
        response = requests.post(f"{BASE_URL}/api/team/members", json=member_data, headers=admin_headers)
        assert response.status_code == 200, f"Failed to create temporary member: {response.text}"
        
        member = response.json()
        assert member["nom"] == "TEST_Temporaire"
        assert member["prenom"] == "Intérimaire"
        assert member["type"] == "temporary"
        assert member["service"] == "Maintenance"
        assert "id" in member
        
        print(f"✅ Temporary member created: {member['prenom']} {member['nom']} (ID: {member['id']})")
        return member
    
    def test_get_team_member_by_id(self, admin_headers):
        """GET /api/team/members/{id} - Get specific member"""
        # First create a member
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        member_data = {
            "nom": "TEST_GetById",
            "prenom": "Member",
            "service": "Maintenance",
            "poste": "Test",
            "mission_start": today,
            "mission_end": end_date,
            "work_rhythm": "journee"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/team/members", json=member_data, headers=admin_headers)
        assert create_response.status_code == 200
        created_member = create_response.json()
        member_id = created_member["id"]
        
        # Get the member by ID
        response = requests.get(f"{BASE_URL}/api/team/members/{member_id}", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get member by ID: {response.text}"
        
        member = response.json()
        assert member["id"] == member_id
        assert member["nom"] == "TEST_GetById"
        
        print(f"✅ Member retrieved by ID: {member['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/team/members/{member_id}", headers=admin_headers)
        return member
    
    def test_update_temporary_member(self, admin_headers):
        """PUT /api/team/members/{id} - Update temporary member"""
        # First create a member
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        member_data = {
            "nom": "TEST_Update",
            "prenom": "Before",
            "service": "Maintenance",
            "poste": "Test",
            "mission_start": today,
            "mission_end": end_date,
            "work_rhythm": "journee"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/team/members", json=member_data, headers=admin_headers)
        assert create_response.status_code == 200
        created_member = create_response.json()
        member_id = created_member["id"]
        
        # Update the member
        update_data = {
            "prenom": "After",
            "poste": "Technicien Senior",
            "work_rhythm": "2x8_matin"
        }
        
        response = requests.put(f"{BASE_URL}/api/team/members/{member_id}", json=update_data, headers=admin_headers)
        assert response.status_code == 200, f"Failed to update member: {response.text}"
        
        updated_member = response.json()
        assert updated_member["prenom"] == "After"
        assert updated_member["poste"] == "Technicien Senior"
        assert updated_member["work_rhythm"] == "2x8_matin"
        
        print(f"✅ Member updated: {updated_member['prenom']} {updated_member['nom']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/team/members/{member_id}", headers=admin_headers)
        return updated_member
    
    def test_delete_temporary_member(self, admin_headers):
        """DELETE /api/team/members/{id} - Delete temporary member"""
        # First create a member
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        member_data = {
            "nom": "TEST_Delete",
            "prenom": "ToDelete",
            "service": "Maintenance",
            "poste": "Test",
            "mission_start": today,
            "mission_end": end_date,
            "work_rhythm": "journee"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/team/members", json=member_data, headers=admin_headers)
        assert create_response.status_code == 200
        created_member = create_response.json()
        member_id = created_member["id"]
        
        # Delete the member
        response = requests.delete(f"{BASE_URL}/api/team/members/{member_id}", headers=admin_headers)
        assert response.status_code == 200, f"Failed to delete member: {response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/team/members/{member_id}", headers=admin_headers)
        assert get_response.status_code == 404, "Member should not exist after deletion"
        
        print(f"✅ Member deleted: {member_id}")


class TestTimeTracking:
    """Test time tracking APIs"""
    
    @pytest.fixture
    def test_member(self, admin_headers):
        """Create a test member for time tracking tests"""
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        member_data = {
            "nom": "TEST_TimeTracking",
            "prenom": "Worker",
            "service": "Maintenance",
            "poste": "Technicien",
            "mission_start": today,
            "mission_end": end_date,
            "work_rhythm": "journee"
        }
        
        response = requests.post(f"{BASE_URL}/api/team/members", json=member_data, headers=admin_headers)
        assert response.status_code == 200
        member = response.json()
        
        yield member
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/team/members/{member['id']}", headers=admin_headers)
    
    def test_clock_in(self, admin_headers, test_member):
        """POST /api/time-tracking/clock-in - Clock in"""
        response = requests.post(
            f"{BASE_URL}/api/time-tracking/clock-in",
            params={"member_id": test_member["id"]},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed to clock in: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert "time_entry" in data
        assert data["time_entry"]["clock_in"] is not None
        
        print(f"✅ Clock-in successful: {data['message']}")
        return data
    
    def test_clock_out(self, admin_headers, test_member):
        """POST /api/time-tracking/clock-out - Clock out"""
        # First clock in
        requests.post(
            f"{BASE_URL}/api/time-tracking/clock-in",
            params={"member_id": test_member["id"]},
            headers=admin_headers
        )
        
        # Then clock out
        response = requests.post(
            f"{BASE_URL}/api/time-tracking/clock-out",
            params={"member_id": test_member["id"]},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed to clock out: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert "time_entry" in data
        assert data["time_entry"]["clock_out"] is not None
        assert data["time_entry"]["status"] == "complete"
        
        print(f"✅ Clock-out successful: {data['message']}")
        return data
    
    def test_present_at_post(self, admin_headers, test_member):
        """POST /api/time-tracking/present-at-post - Mark as present at post"""
        # Use a different date to avoid conflict with clock-in/out tests
        test_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.post(
            f"{BASE_URL}/api/time-tracking/present-at-post",
            params={"member_id": test_member["id"], "date": test_date},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed to mark present at post: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert "time_entry" in data
        time_entry = data["time_entry"]
        assert time_entry["status"] == "complete"
        assert time_entry["source"] == "present_at_post"
        assert time_entry["clock_in"] is not None
        assert time_entry["clock_out"] is not None
        
        print(f"✅ Present at post successful: {data['message']}")
        return data
    
    def test_manual_time_entry(self, admin_headers, test_member):
        """POST /api/time-tracking/manual-entry - Manual time entry"""
        test_date = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
        
        entry_data = {
            "member_id": test_member["id"],
            "date": test_date,
            "clock_in": "08:30",
            "clock_out": "17:30",
            "reason": "Saisie manuelle test",
            "notes": "Test pytest"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/time-tracking/manual-entry",
            json=entry_data,
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed manual entry: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert "time_entry" in data
        time_entry = data["time_entry"]
        assert time_entry["clock_in"] == "08:30"
        assert time_entry["clock_out"] == "17:30"
        assert time_entry["source"] == "manual_entry"
        assert time_entry["worked_hours"] > 0
        
        print(f"✅ Manual entry successful: {time_entry['worked_hours']}h worked")
        return data
    
    def test_get_today_entry(self, admin_headers, test_member):
        """GET /api/time-tracking/today - Get today's time entry"""
        response = requests.get(
            f"{BASE_URL}/api/time-tracking/today",
            params={"member_id": test_member["id"]},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed to get today entry: {response.text}"
        
        data = response.json()
        assert "date" in data
        assert "member" in data
        
        print(f"✅ Today entry retrieved for date: {data['date']}")
        return data
    
    def test_get_time_history(self, admin_headers, test_member):
        """GET /api/time-tracking/history - Get time tracking history"""
        response = requests.get(
            f"{BASE_URL}/api/time-tracking/history",
            params={"member_id": test_member["id"]},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed to get history: {response.text}"
        
        data = response.json()
        assert "entries" in data
        assert "start_date" in data
        assert "end_date" in data
        
        print(f"✅ Time history retrieved: {data['count']} entries")
        return data


class TestAbsences:
    """Test absence declaration APIs"""
    
    @pytest.fixture
    def test_member_for_absence(self, admin_headers):
        """Create a test member for absence tests"""
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=60)).strftime("%Y-%m-%d")
        
        member_data = {
            "nom": "TEST_Absence",
            "prenom": "Worker",
            "service": "Maintenance",
            "poste": "Technicien",
            "mission_start": today,
            "mission_end": end_date,
            "work_rhythm": "journee"
        }
        
        response = requests.post(f"{BASE_URL}/api/team/members", json=member_data, headers=admin_headers)
        assert response.status_code == 200
        member = response.json()
        
        yield member
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/team/members/{member['id']}", headers=admin_headers)
    
    def test_get_absence_types(self, admin_headers):
        """GET /api/time-tracking/absence-types - List absence types"""
        response = requests.get(f"{BASE_URL}/api/time-tracking/absence-types", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get absence types: {response.text}"
        
        types = response.json()
        assert isinstance(types, list)
        assert len(types) >= 6, f"Expected at least 6 absence types, got {len(types)}"
        
        # Check for expected types (TT is the code for Télétravail)
        type_codes = [t["code"] for t in types]
        expected_codes = ["CP", "RTT", "MALADIE", "FORMATION", "RQP", "TT"]
        for code in expected_codes:
            assert code in type_codes, f"Missing expected absence type: {code}"
        
        print(f"✅ Absence types retrieved: {len(types)} types")
    
    def test_declare_absence(self, admin_headers, test_member_for_absence):
        """POST /api/time-tracking/absences - Declare an absence"""
        start_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        
        absence_data = {
            "member_id": test_member_for_absence["id"],
            "member_type": "temporary",
            "absence_type": "CP",
            "start_date": start_date,
            "end_date": end_date,
            "reason": "Congés payés test",
            "notes": "Test pytest"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/time-tracking/absences",
            json=absence_data,
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed to declare absence: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert "absence" in data
        absence = data["absence"]
        assert absence["absence_type"] == "CP"
        assert absence["start_date"] == start_date
        assert absence["end_date"] == end_date
        
        print(f"✅ Absence declared: {absence['absence_type']} from {start_date} to {end_date}")
        return data
    
    def test_get_absences(self, admin_headers):
        """GET /api/time-tracking/absences - List absences"""
        response = requests.get(f"{BASE_URL}/api/time-tracking/absences", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get absences: {response.text}"
        
        data = response.json()
        # API returns a list directly, not wrapped in "absences" key
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✅ Absences retrieved: {len(data)} absences")


class TestTeamPresence:
    """Test team presence/status APIs"""
    
    def test_get_team_presence(self, admin_headers):
        """GET /api/team/presence - Get team presence status"""
        response = requests.get(f"{BASE_URL}/api/team/presence", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get team presence: {response.text}"
        
        data = response.json()
        assert "date" in data
        assert "members" in data
        assert "summary" in data
        
        summary = data["summary"]
        assert "total" in summary
        assert "present" in summary
        assert "absent" in summary
        
        print(f"✅ Team presence retrieved: {summary['total']} members, {summary['present']} present")
        return data


class TestTeamDashboard:
    """Test team dashboard APIs"""
    
    def test_get_team_dashboard(self, admin_headers):
        """GET /api/team/dashboard - Get team dashboard KPIs"""
        response = requests.get(
            f"{BASE_URL}/api/team/dashboard",
            params={"period": "week"},
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed to get dashboard: {response.text}"
        
        data = response.json()
        assert "period" in data
        assert "kpis" in data
        
        kpis = data["kpis"]
        assert "total_members" in kpis
        assert "presence_rate" in kpis
        assert "total_worked_hours" in kpis
        assert "total_overtime_hours" in kpis
        
        print(f"✅ Dashboard retrieved: {kpis['total_members']} members, {kpis['presence_rate']}% presence rate")
        return data
    
    def test_get_team_workload(self, admin_headers):
        """GET /api/team/workload - Get team workload"""
        response = requests.get(f"{BASE_URL}/api/team/workload", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get workload: {response.text}"
        
        data = response.json()
        assert "members" in data
        assert "summary" in data
        
        summary = data["summary"]
        assert "total_members" in summary
        assert "average_load" in summary
        
        print(f"✅ Workload retrieved: {summary['total_members']} members, {summary['average_load']}% avg load")
        return data
    
    def test_get_team_overtime(self, admin_headers):
        """GET /api/team/overtime - Get team overtime"""
        response = requests.get(f"{BASE_URL}/api/team/overtime", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get overtime: {response.text}"
        
        data = response.json()
        assert "year" in data
        assert "month" in data
        assert "members" in data
        assert "summary" in data
        
        print(f"✅ Overtime retrieved for {data['year']}-{data['month']}: {data['summary']['total_overtime_hours']}h total")
        return data


class TestMenuMigration:
    """Test menu migration API"""
    
    def test_migrate_menus(self, admin_headers):
        """POST /api/user-preferences/migrate-menus - Migrate menus"""
        response = requests.post(
            f"{BASE_URL}/api/user-preferences/migrate-menus",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed to migrate menus: {response.text}"
        
        data = response.json()
        assert "message" in data
        
        print(f"✅ Menu migration: {data['message']}")
        return data


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_members(self, admin_headers):
        """Clean up TEST_ prefixed members"""
        response = requests.get(f"{BASE_URL}/api/team/members", headers=admin_headers)
        if response.status_code == 200:
            members = response.json()
            deleted_count = 0
            for member in members:
                if member.get("nom", "").startswith("TEST_"):
                    del_response = requests.delete(
                        f"{BASE_URL}/api/team/members/{member['id']}",
                        headers=admin_headers
                    )
                    if del_response.status_code == 200:
                        deleted_count += 1
            print(f"✅ Cleanup: Deleted {deleted_count} test members")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
