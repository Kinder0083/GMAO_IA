"""Test E2E déplacement de zones (parent_id update)."""
import asyncio, os, json
from dotenv import load_dotenv; load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from bson import ObjectId
import urllib.request, urllib.error

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    # Cleanup
    await db.locations.delete_many({"nom": {"$regex": "^MOVE-TEST-"}})

    # Hiérarchie: A (root) -> B (child) -> C (grandchild)
    res_a = await db.locations.insert_one({
        "nom": "MOVE-TEST-A", "type": "USINE", "parent_id": None,
        "level": 0, "createdAt": datetime.now(timezone.utc),
    })
    a_id = str(res_a.inserted_id)
    res_b = await db.locations.insert_one({
        "nom": "MOVE-TEST-B", "type": "ZONE", "parent_id": a_id,
        "level": 1, "createdAt": datetime.now(timezone.utc),
    })
    b_id = str(res_b.inserted_id)
    res_c = await db.locations.insert_one({
        "nom": "MOVE-TEST-C", "type": "SOUS_ZONE", "parent_id": b_id,
        "level": 2, "createdAt": datetime.now(timezone.utc),
    })
    c_id = str(res_c.inserted_id)
    res_d = await db.locations.insert_one({
        "nom": "MOVE-TEST-D", "type": "USINE", "parent_id": None,
        "level": 0, "createdAt": datetime.now(timezone.utc),
    })
    d_id = str(res_d.inserted_id)
    print(f"Hiérarchie créée:")
    print(f"  A (root)   : {a_id}")
    print(f"  └── B      : {b_id}")
    print(f"      └── C  : {c_id}")
    print(f"  D (root)   : {d_id}")

    # Login
    API = os.environ.get('API_URL', 'http://localhost:8001')
    token = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email":"admin@test.com","password":"Admin123!"}).encode(),
        headers={"Content-Type":"application/json"}, method="POST"
    )).read())["access_token"]
    H = {"Authorization": f"Bearer {token}", "Content-Type":"application/json"}

    def call_update(loc_id, payload, expect_status=200):
        try:
            req = urllib.request.Request(
                f"{API}/api/locations/{loc_id}",
                data=json.dumps(payload).encode(),
                headers=H, method="PUT"
            )
            resp = urllib.request.urlopen(req).read()
            return 200, json.loads(resp)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode())

    # === TEST 1 : Déplacer B vers D (changement de parent valide)
    print("\n=== TEST 1 : Déplacer B (sous A) vers D (root) ===")
    code, body = call_update(b_id, {"nom": "MOVE-TEST-B", "type": "ZONE", "parent_id": d_id})
    print(f"  HTTP {code}: parent_id maintenant = {body.get('parent_id')}")
    assert code == 200 and body.get('parent_id') == d_id

    # === TEST 2 : Cycle — tenter de déplacer A SOUS C (qui est descendant de A originellement)
    # mais après TEST1, B/C ne sont plus descendants de A. On les remet:
    await db.locations.update_one({"_id": ObjectId(b_id)}, {"$set": {"parent_id": a_id}})
    print("\n=== TEST 2 : Cycle — tenter A → enfant de C (descendant de A) ===")
    code, body = call_update(a_id, {"nom": "MOVE-TEST-A", "type": "USINE", "parent_id": c_id})
    print(f"  HTTP {code}: detail={body.get('detail','')[:80]}")
    assert code == 400, "Le cycle aurait dû être détecté"

    # === TEST 3 : Auto-référence
    print("\n=== TEST 3 : Auto-référence — A → parent=A ===")
    code, body = call_update(a_id, {"nom": "MOVE-TEST-A", "type": "USINE", "parent_id": a_id})
    print(f"  HTTP {code}: detail={body.get('detail','')[:80]}")
    assert code == 400

    # === TEST 4 : Déplacer C vers la racine (parent_id = "")
    print("\n=== TEST 4 : Déplacer C vers RACINE (parent_id='') ===")
    code, body = call_update(c_id, {"nom": "MOVE-TEST-C", "type": "USINE", "parent_id": ""})
    print(f"  HTTP {code}: parent_id maintenant = {body.get('parent_id')}")
    assert code == 200 and body.get('parent_id') is None

    # === TEST 5 : Profondeur max — créer A→B→C→D (4 niveaux interdit)
    # Remettre la hiérarchie A→B→C
    await db.locations.update_one({"_id": ObjectId(c_id)}, {"$set": {"parent_id": b_id}})
    res_e = await db.locations.insert_one({
        "nom": "MOVE-TEST-E", "type": "SOUS_ZONE", "parent_id": None,
        "createdAt": datetime.now(timezone.utc),
    })
    e_id = str(res_e.inserted_id)
    print("\n=== TEST 5 : Profondeur max — déplacer E sous C (qui est niveau 2) ===")
    code, body = call_update(e_id, {"nom": "MOVE-TEST-E", "type": "SOUS_ZONE", "parent_id": c_id})
    print(f"  HTTP {code}: detail={body.get('detail','')[:80]}")
    assert code == 400

    print("\n🎯 Tous les tests passent")

    # Cleanup
    await db.locations.delete_many({"nom": {"$regex": "^MOVE-TEST-"}})

asyncio.run(main())
