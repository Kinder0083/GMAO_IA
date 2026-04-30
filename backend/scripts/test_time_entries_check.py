"""Test E2E du check time_entries_integrity."""
import asyncio, os, uuid
from dotenv import load_dotenv; load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    user = await db.users.find_one({"email": "admin@test.com"}, {"_id": 1, "id": 1, "nom": 1, "prenom": 1})
    canonical_id = str(user["_id"])
    uuid_id = user.get("id") or canonical_id
    uname = f"{user.get('prenom','')} {user.get('nom','')}".strip()
    print(f"canonical id: {canonical_id}, uuid id: {uuid_id}")

    # Nettoyage
    await db.work_orders.delete_many({"numero": "TEST-INT"})

    # Créer un OT avec 3 time_entries volontairement pourries
    wo_id = str(uuid.uuid4())
    wo_doc = {
        "id": wo_id, "numero": "TEST-INT", "titre": "Test intégrité pointages",
        "categorie": "TRAVAUX_CURATIF", "statut": "EN_COURS",
        "tempsReel": 6, "dateCreation": datetime.now(timezone.utc),
        "time_entries": [
            # A) timestamp en string (cas legacy)
            {"id": "e-str", "user_id": canonical_id, "user_name": uname,
             "hours": 2.0, "timestamp": "2026-04-15T10:00:00.000Z"},
            # B) user_id non-canonique (UUID)
            {"id": "e-uuid", "user_id": uuid_id if uuid_id != canonical_id else canonical_id,
             "user_name": uname, "hours": 2.0,
             "timestamp": datetime(2026, 4, 15, 11, 0, tzinfo=timezone.utc)},
            # C) user_id orphelin
            {"id": "e-orph", "user_id": "fake-user-does-not-exist", "user_name": "Ancien Tech",
             "hours": 2.0, "timestamp": datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)},
        ]
    }
    res = await db.work_orders.insert_one(wo_doc)
    print(f"OT créé _id={res.inserted_id}\n")

    # Login + scan via API
    import urllib.request, json
    API = os.environ.get('API_URL', 'http://localhost:8001')
    login = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email":"admin@test.com","password":"Admin123!"}).encode(),
        headers={"Content-Type":"application/json"}, method="POST"
    )
    token = json.loads(urllib.request.urlopen(login).read())["access_token"]
    H = {"Authorization": f"Bearer {token}"}

    scan = json.loads(urllib.request.urlopen(
        urllib.request.Request(f"{API}/api/admin/data-integrity/scan", headers=H)
    ).read())
    print("=== SCAN ===")
    te = [c for c in scan["checks"] if c["id"] == "time_entries_integrity"][0]
    print(f"time_entries_integrity issues: {te['issues_count']}")
    for d in te["details"]:
        print(f"  {d['issue_type']:<25} entry={d['entry_id']:<10} curr={d.get('current','?')[:40]}  → target={d.get('target','?')}")

    print("\n=== DRY-RUN ===")
    req = urllib.request.Request(
        f"{API}/api/admin/data-integrity/repair",
        data=json.dumps({"check_id":"time_entries_integrity","dry_run":True}).encode(),
        headers={**H, "Content-Type":"application/json"}, method="POST"
    )
    r = json.loads(urllib.request.urlopen(req).read())
    res_te = r["results"]["time_entries_integrity"]
    print(f"planned: {res_te['planned_count']}, modified: {res_te['modified_count']}, summary: {res_te.get('summary')}")

    print("\n=== APPLY ===")
    req = urllib.request.Request(
        f"{API}/api/admin/data-integrity/repair",
        data=json.dumps({"check_id":"time_entries_integrity","dry_run":False}).encode(),
        headers={**H, "Content-Type":"application/json"}, method="POST"
    )
    r = json.loads(urllib.request.urlopen(req).read())
    res_te = r["results"]["time_entries_integrity"]
    print(f"planned: {res_te['planned_count']}, modified: {res_te['modified_count']}, summary: {res_te.get('summary')}")

    # Vérif après réparation
    wo_after = await db.work_orders.find_one({"_id": res.inserted_id}, {"time_entries": 1})
    print("\n=== ÉTAT FINAL DES ENTRIES ===")
    for e in wo_after["time_entries"]:
        ts = e.get("timestamp")
        print(f"  {e['id']:<10} user_id={e.get('user_id'):<30} user_name={e.get('user_name','?'):<25} ts={ts!r} ({type(ts).__name__})")

    # Rescan
    scan2 = json.loads(urllib.request.urlopen(
        urllib.request.Request(f"{API}/api/admin/data-integrity/scan", headers=H)
    ).read())
    te2 = [c for c in scan2["checks"] if c["id"] == "time_entries_integrity"][0]
    print(f"\n=== RESCAN ===")
    print(f"time_entries_integrity issues après réparation: {te2['issues_count']}")

    # Test du rapport : les heures doivent maintenant remonter au 15 avril
    rep_url = f"{API}/api/reports/user-time-tracking?period=custom&start_date=2026-04-13&end_date=2026-04-19&categories=TRAVAUX_CURATIF&user_ids={canonical_id}"
    rep = json.loads(urllib.request.urlopen(
        urllib.request.Request(rep_url, headers=H)
    ).read())
    for _, u in rep.get("users", {}).items():
        tot = sum(sum(v) for v in u.get("data", {}).values())
        print(f"\n  Report semaine 13-19 avril {u['user']['name']}: total={tot}h (attendu: 4h si user_id resync ok)")

    # Cleanup
    await db.work_orders.delete_one({"_id": res.inserted_id})
    print("\nCleanup OK")

asyncio.run(main())
