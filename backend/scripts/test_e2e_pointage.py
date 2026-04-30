"""Test E2E bug pointage : update date via API puis check report."""
import asyncio, os, uuid, subprocess
from dotenv import load_dotenv; load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    user = await db.users.find_one({"email": "admin@test.com"}, {"_id": 1, "nom": 1, "prenom": 1})
    uid = str(user["_id"])
    uname = f"{user.get('prenom','')} {user.get('nom','')}".strip()
    entry_id = str(uuid.uuid4())
    wo_id = str(uuid.uuid4())
    numero = "TEST-E2E-POINTAGE"
    await db.work_orders.delete_many({"numero": numero})

    # Initial : timestamp aware UTC — 30 avril
    initial_ts = datetime(2026, 4, 30, 15, 0, 0, tzinfo=timezone.utc)
    wo_doc = {
        "id": wo_id, "numero": numero, "titre": "Test E2E bug pointage",
        "categorie": "TRAVAUX_CURATIF", "statut": "EN_COURS",
        "tempsEstime": 4, "tempsReel": 2,
        "dateCreation": datetime.now(timezone.utc), "created_by": uid,
        "time_entries": [{
            "id": entry_id, "user_id": uid, "user_name": uname,
            "hours": 2.0, "timestamp": initial_ts
        }]
    }
    res = await db.work_orders.insert_one(wo_doc)
    print(f"OT créé: _id={res.inserted_id}, uuid={wo_id}, entry_id={entry_id}")
    print(f"user_id: {uid}, initial ts: {initial_ts}\n")

    # Lire depuis l'API avant update
    import urllib.request, json
    token_req = urllib.request.Request(
        f"{os.environ.get('API_URL', 'http://localhost:8001')}/api/auth/login",
        data=json.dumps({"email":"admin@test.com","password":"Admin123!"}).encode(),
        headers={"Content-Type":"application/json"}, method="POST"
    )
    token = json.loads(urllib.request.urlopen(token_req).read())["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type":"application/json"}

    API = os.environ.get('API_URL', 'http://localhost:8001')

    # AVANT update — query le report sur 27 avril - 3 mai (ancienne date = semaine 30 avril)
    print("=== AVANT UPDATE — report sur 27 avril→3 mai (ancienne date) ===")
    req = urllib.request.Request(
        f"{API}/api/reports/user-time-tracking?period=custom&start_date=2026-04-27&end_date=2026-05-03&categories=TRAVAUX_CURATIF&user_ids={uid}",
        headers=headers, method="GET"
    )
    data = json.loads(urllib.request.urlopen(req).read())
    for u_id, u in data.get("users", {}).items():
        tot = sum(sum(v) for v in u.get("data", {}).values())
        print(f"  user={u['user']['name']}  total={tot}h")
        for cat, vals in u.get("data", {}).items():
            if any(vals):
                print(f"    {cat}: {vals}")
    print()

    # UPDATE via API — change la date à 26 avril
    print("=== UPDATE via API : timestamp → 2026-04-26T10:00:00Z ===")
    req = urllib.request.Request(
        f"{API}/api/work-orders/{wo_id}/time-entries/{entry_id}",
        data=json.dumps({"hours": 2, "timestamp": "2026-04-26T10:00:00.000Z"}).encode(),
        headers=headers, method="PUT"
    )
    try:
        resp = urllib.request.urlopen(req).read()
        print(f"update OK: {resp.decode()}")
    except urllib.error.HTTPError as e:
        print(f"update HTTP {e.code}: {e.read().decode()}")

    # Vérif base après update
    wo_after = await db.work_orders.find_one({"id": wo_id}, {"time_entries": 1})
    if wo_after and wo_after.get("time_entries"):
        ts = wo_after["time_entries"][0]["timestamp"]
        print(f"Stored ts after update: {ts!r} (type={type(ts).__name__}, tz={getattr(ts,'tzinfo',None)})\n")
    else:
        print("WO introuvable par uuid !")
        # Essayer par _id
        wo_after = await db.work_orders.find_one({"_id": res.inserted_id}, {"time_entries": 1})
        if wo_after:
            ts = wo_after["time_entries"][0]["timestamp"]
            print(f"(via _id) Stored ts: {ts!r}\n")

    # APRES update — query le report sur 20-26 avril (nouvelle date)
    print("=== APRÈS UPDATE — report sur 20-26 avril (nouvelle date) ===")
    req = urllib.request.Request(
        f"{API}/api/reports/user-time-tracking?period=custom&start_date=2026-04-20&end_date=2026-04-26&categories=TRAVAUX_CURATIF&user_ids={uid}",
        headers=headers, method="GET"
    )
    data = json.loads(urllib.request.urlopen(req).read())
    for u_id, u in data.get("users", {}).items():
        tot = sum(sum(v) for v in u.get("data", {}).values())
        print(f"  user={u['user']['name']}  total={tot}h")
        for cat, vals in u.get("data", {}).items():
            if any(vals):
                print(f"    {cat}: {vals}")

    print("\n=== APRÈS UPDATE — report sur 27 avril→3 mai (ancienne semaine, doit être vide) ===")
    req = urllib.request.Request(
        f"{API}/api/reports/user-time-tracking?period=custom&start_date=2026-04-27&end_date=2026-05-03&categories=TRAVAUX_CURATIF&user_ids={uid}",
        headers=headers, method="GET"
    )
    data = json.loads(urllib.request.urlopen(req).read())
    for u_id, u in data.get("users", {}).items():
        tot = sum(sum(v) for v in u.get("data", {}).values())
        print(f"  user={u['user']['name']}  total={tot}h")
        for cat, vals in u.get("data", {}).items():
            if any(vals):
                print(f"    {cat}: {vals}")

    # Cleanup
    await db.work_orders.delete_one({"_id": res.inserted_id})
    print("\nCleanup OK")

asyncio.run(main())
