"""Test E2E détection + réparation des doublons de numéro d'OT."""
import asyncio, os, uuid, json
from dotenv import load_dotenv; load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import urllib.request

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]

    # Cleanup
    await db.work_orders.delete_many({"titre": {"$regex": "^DUP-TEST-"}})

    # Créer 5 OT avec le même numero (simule le bug en prod)
    base = datetime.now(timezone.utc)
    ot_data = []
    for i in range(5):
        ot = {
            "id": str(uuid.uuid4()),
            "numero": "5879",  # tous avec le même numéro
            "titre": f"DUP-TEST-{i+1} Installation potence {i+1}",
            "categorie": "TRAVAUX_DIVERS",
            "statut": ["OUVERT", "ATT_DECISION", "OUVERT", "TERMINE", "OUVERT"][i],
            "tempsReel": 0,
            "dateCreation": base + timedelta(minutes=i),  # le 1er est le plus ancien
            "created_by": "admin",
        }
        await db.work_orders.insert_one(ot)
        ot_data.append(ot)
    print(f"5 OT créés avec numéro #5879 (+ autres vrais OT en base)\n")

    # Login
    API = os.environ.get('API_URL', 'http://localhost:8001')
    token = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email":"admin@test.com","password":"Admin123!"}).encode(),
        headers={"Content-Type":"application/json"}, method="POST"
    )).read())["access_token"]
    H = {"Authorization": f"Bearer {token}", "Content-Type":"application/json"}

    # SCAN
    scan = json.loads(urllib.request.urlopen(urllib.request.Request(f"{API}/api/admin/data-integrity/scan", headers=H)).read())
    check = [c for c in scan['checks'] if c['id'] == 'work_orders_duplicate_numero'][0]
    print(f"=== SCAN: check '{check['label']}' ===")
    print(f"issues_count: {check['issues_count']} (attendu: ≥4 pour notre groupe)")
    our_group = next((g for g in check['details'] if g['numero'] == '5879'), None)
    if our_group:
        print(f"Notre groupe #5879: count={our_group['count']}, to_renumber={len(our_group['to_renumber'])}")
        print(f"  KEEP (plus ancien) : {our_group['keep']['titre']}")
        for d in our_group['to_renumber']:
            print(f"  RENUMBER           : {d['titre']}  open_url={d['open_url']}")
    else:
        print("❌ Groupe #5879 non trouvé dans le scan")
        return

    # DRY-RUN
    print("\n=== DRY-RUN ===")
    dry = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"{API}/api/admin/data-integrity/repair",
        data=json.dumps({"check_id":"work_orders_duplicate_numero","dry_run":True}).encode(),
        headers=H, method="POST"
    )).read())
    r = dry['results']['work_orders_duplicate_numero']
    print(f"planned: {r['planned_count']}, modified: {r['modified_count']}")
    print(f"message: {r['message']}")

    # APPLY
    print("\n=== APPLY ===")
    apply_res = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"{API}/api/admin/data-integrity/repair",
        data=json.dumps({"check_id":"work_orders_duplicate_numero","dry_run":False}).encode(),
        headers=H, method="POST"
    )).read())
    r = apply_res['results']['work_orders_duplicate_numero']
    print(f"planned: {r['planned_count']}, modified: {r['modified_count']}")
    print(f"counter_resynced_to: {r.get('counter_resynced_to')}")
    for log in r.get('renumbering_log', []):
        print(f"  {log['titre'][:50]:<50} : {log['old_numero']} → {log['new_numero']}")

    # Vérif final
    print("\n=== ÉTAT FINAL ===")
    final = []
    async for wo in db.work_orders.find({"titre": {"$regex": "^DUP-TEST-"}}, {"_id":0,"titre":1,"numero":1}):
        final.append((wo['titre'], wo['numero']))
    final.sort()
    for t, n in final:
        print(f"  {t[:50]:<50} -> #{n}")

    # Rescan
    scan2 = json.loads(urllib.request.urlopen(urllib.request.Request(f"{API}/api/admin/data-integrity/scan", headers=H)).read())
    check2 = [c for c in scan2['checks'] if c['id'] == 'work_orders_duplicate_numero'][0]
    our2 = next((g for g in check2['details'] if g['numero'] == '5879'), None)
    print(f"\nRE-SCAN: groupe #5879 encore présent? {'OUI' if our2 else 'NON ✅'}")

    # Vérifier le compteur
    counter = await db.counters.find_one({"_id": "work_order_numero"})
    print(f"Compteur work_order_numero actuel: {counter['seq'] if counter else 'N/A'}")

    # Cleanup
    await db.work_orders.delete_many({"titre": {"$regex": "^DUP-TEST-"}})
    print("\nCleanup OK")

asyncio.run(main())
