"""Test E2E réassignation orphelin via API."""
import asyncio, os, uuid, json
from dotenv import load_dotenv; load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import urllib.request

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    user = await db.users.find_one({"email": "admin@test.com"}, {"_id": 1})
    uid = str(user["_id"])

    # Crée un OT avec 2 entries orphelines
    await db.work_orders.delete_many({"numero": "TEST-REASSIGN"})
    wo_uuid = str(uuid.uuid4())
    wo_doc = {
        "id": wo_uuid, "numero": "TEST-REASSIGN",
        "titre": "OT pour test reassignation", "categorie": "TRAVAUX_CURATIF",
        "statut": "EN_COURS", "tempsReel": 4,
        "dateCreation": datetime.now(timezone.utc),
        "time_entries": [
            {"id": "e-orph-A", "user_id": "ghost-1", "user_name": "[Utilisateur supprimé]",
             "hours": 2.0, "timestamp": datetime(2026, 4, 20, 10, 0, tzinfo=timezone.utc)},
            {"id": "e-orph-B", "user_id": "ghost-2", "user_name": "Ancien",
             "hours": 2.0, "timestamp": datetime(2026, 4, 20, 14, 0, tzinfo=timezone.utc)},
        ]
    }
    res = await db.work_orders.insert_one(wo_doc)
    print(f"OT créé _id={res.inserted_id}, uuid={wo_uuid}")

    # Login
    API = os.environ.get('API_URL', 'http://localhost:8001')
    login = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email":"admin@test.com","password":"Admin123!"}).encode(),
        headers={"Content-Type":"application/json"}, method="POST"
    )
    token = json.loads(urllib.request.urlopen(login).read())["access_token"]
    H = {"Authorization": f"Bearer {token}", "Content-Type":"application/json"}

    # Scan : doit voir l'OT
    scan = json.loads(urllib.request.urlopen(
        urllib.request.Request(f"{API}/api/admin/data-integrity/scan", headers=H)
    ).read())
    orphans = [c for c in scan['checks'] if c['id'] == 'orphan_user_assignments'][0]
    target = next((d for d in orphans['details'] if d.get('numero') == 'TEST-REASSIGN'), None)
    assert target, "OT non trouvé dans le scan"
    print(f"\n✅ Scan: trouve {len(target['entries'])} entries orphelines")
    for e in target['entries']:
        print(f"   - entry {e['entry_id']}: {e['hours']}h, user_name={e['user_name']!r}")

    # Réassigner les 2 entries → admin user
    print(f"\n🔄 Réassignation au user {uid}...")
    for entry in target['entries']:
        payload = {"hours": entry['hours'], "user_id": uid}
        if entry.get('timestamp'):
            payload['timestamp'] = entry['timestamp']
        req = urllib.request.Request(
            f"{API}/api/work-orders/{wo_uuid}/time-entries/{entry['entry_id']}",
            data=json.dumps(payload).encode(), headers=H, method="PUT"
        )
        try:
            resp = json.loads(urllib.request.urlopen(req).read())
            print(f"   ✅ entry {entry['entry_id']}: réassigné → {payload['user_id']}")
        except Exception as e:
            print(f"   ❌ entry {entry['entry_id']}: {e}")

    # Vérif state final
    wo_after = await db.work_orders.find_one({"_id": res.inserted_id}, {"time_entries": 1})
    print("\n=== ÉTAT FINAL DES ENTRIES ===")
    for e in wo_after["time_entries"]:
        print(f"   {e['id']:<15} user_id={e.get('user_id')[:25]:<25} user_name={e.get('user_name','?')}")

    # Re-scan : doit ne plus voir cet OT dans orphans
    scan2 = json.loads(urllib.request.urlopen(
        urllib.request.Request(f"{API}/api/admin/data-integrity/scan", headers=H)
    ).read())
    orphans2 = [c for c in scan2['checks'] if c['id'] == 'orphan_user_assignments'][0]
    target2 = next((d for d in orphans2['details'] if d.get('numero') == 'TEST-REASSIGN'), None)
    if target2:
        print(f"\n❌ OT toujours dans la liste orphan ({len(target2['entries'])} entries)")
    else:
        print(f"\n✅ Re-scan : OT n'apparaît plus dans orphan_user_assignments")

    # Cleanup
    await db.work_orders.delete_one({"_id": res.inserted_id})
    print("\nCleanup OK")

asyncio.run(main())
