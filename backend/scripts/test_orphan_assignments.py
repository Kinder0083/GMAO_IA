"""Test E2E orphan_user_assignments + badge headers."""
import asyncio, os, uuid
from dotenv import load_dotenv; load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    user = await db.users.find_one({"email": "admin@test.com"}, {"_id": 1})
    uid = str(user["_id"])

    # Cleanup
    await db.work_orders.delete_many({"numero": {"$in": ["TEST-ORPH-WO", "TEST-ORPH-IMP"]}})
    await db.improvements.delete_many({"numero": "TEST-ORPH-IMP"})

    # Créer 1 OT avec entry orphelin (déjà marqué)
    wo_doc = {
        "id": str(uuid.uuid4()), "numero": "TEST-ORPH-WO",
        "titre": "OT avec utilisateur supprimé", "categorie": "TRAVAUX_CURATIF",
        "statut": "EN_COURS", "tempsReel": 2,
        "dateCreation": datetime.now(timezone.utc),
        "time_entries": [
            {"id": "e-good", "user_id": uid, "user_name": "Test Admin",
             "hours": 1.0, "timestamp": datetime(2026, 4, 15, 10, 0, tzinfo=timezone.utc)},
            {"id": "e-orph1", "user_id": "ghost-user-1", "user_name": "[Utilisateur supprimé]",
             "hours": 1.0, "timestamp": datetime(2026, 4, 15, 11, 0, tzinfo=timezone.utc)},
        ]
    }
    res_wo = await db.work_orders.insert_one(wo_doc)

    # Créer 1 improvement avec entry orphelin non encore marqué (juste user_id introuvable)
    imp_doc = {
        "id": str(uuid.uuid4()), "numero": "TEST-ORPH-IMP",
        "titre": "Amélioration test orphan", "statut": "EN_COURS",
        "dateCreation": datetime.now(timezone.utc),
        "time_entries": [
            {"id": "e-orph2", "user_id": "ghost-user-2", "user_name": "Ancien Tech",
             "hours": 3.0, "timestamp": datetime(2026, 4, 16, 14, 0, tzinfo=timezone.utc)},
        ]
    }
    res_imp = await db.improvements.insert_one(imp_doc)

    print(f"OT créé: id={wo_doc['id']}, numero={wo_doc['numero']}")
    print(f"IMP créé: id={imp_doc['id']}, numero={imp_doc['numero']}\n")

    # Test API
    import urllib.request, json
    API = os.environ.get('API_URL', 'http://localhost:8001')
    login = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email":"admin@test.com","password":"Admin123!"}).encode(),
        headers={"Content-Type":"application/json"}, method="POST"
    )
    token = json.loads(urllib.request.urlopen(login).read())["access_token"]
    H = {"Authorization": f"Bearer {token}"}

    print("=== SCAN ===")
    scan = json.loads(urllib.request.urlopen(
        urllib.request.Request(f"{API}/api/admin/data-integrity/scan", headers=H)
    ).read())
    print(f"total: {scan['total_issues']}, actionable: {scan.get('actionable_issues')}")
    for c in scan['checks']:
        print(f"  {c['id']}: {c['issues_count']} {'(info)' if c.get('informational') else ''}")
        if c['id'] == 'orphan_user_assignments' and c['details']:
            for d in c['details']:
                print(f"    - {d['type_label']:<25} {d['numero']} '{d['titre']}' orphans={d['orphan_count']}")
                print(f"        open_url: {d['open_url']}")

    print("\n=== LAST-SCAN (badge topbar) ===")
    last = json.loads(urllib.request.urlopen(
        urllib.request.Request(f"{API}/api/admin/data-integrity/last-scan", headers=H)
    ).read())
    print(f"actionable_issues: {last.get('actionable_issues')}, total_issues: {last.get('total_issues')}")
    print(f"per_check: {last.get('per_check')}")

    # Cleanup
    await db.work_orders.delete_one({"_id": res_wo.inserted_id})
    await db.improvements.delete_one({"_id": res_imp.inserted_id})
    print("\nCleanup OK")

asyncio.run(main())
