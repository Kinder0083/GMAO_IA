"""Test des 3 nouveaux générateurs de numéro avec retry-on-conflict."""
import asyncio, os, uuid, sys
from dotenv import load_dotenv; load_dotenv()
sys.path.insert(0, '/app/backend')
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    import routes.shared as shared
    shared.db = db
    from routes.shared import (
        get_next_improvement_numero,
        get_next_purchase_request_numero,
        get_next_loto_numero,
    )

    # ─── TEST 1 : IMPROVEMENT ───
    print("=== TEST 1 : get_next_improvement_numero ===")
    await db.improvements.delete_many({"titre": {"$regex": "^TEST-IMP-"}})
    await db.counters.delete_one({"_id": "improvement_numero"})  # reset
    # Créer 2 improvements avec numéros 7100, 7101 pour forcer migration
    await db.improvements.insert_many([
        {"id": str(uuid.uuid4()), "numero": "7100", "titre": "TEST-IMP-existing-1", "dateCreation": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "numero": "7101", "titre": "TEST-IMP-existing-2", "dateCreation": datetime.now(timezone.utc)},
    ])
    n1 = await get_next_improvement_numero()
    print(f"  -> {n1} (attendu: 7102 via migration)")
    assert n1 == "7102", f"expected 7102, got {n1}"
    n2 = await get_next_improvement_numero()
    print(f"  -> {n2} (attendu: 7103)")
    assert n2 == "7103"
    # Forcer un conflit : créer un imp avec 7104 puis appeler
    await db.improvements.insert_one({
        "id": str(uuid.uuid4()), "numero": "7104", "titre": "TEST-IMP-blocker",
        "dateCreation": datetime.now(timezone.utc),
    })
    n3 = await get_next_improvement_numero()
    print(f"  -> {n3} (attendu: 7105, a sauté 7104 conflict)")
    assert n3 == "7105"
    print("  ✅ improvement OK")

    # ─── TEST 2 : PURCHASE REQUEST ───
    print("\n=== TEST 2 : get_next_purchase_request_numero ===")
    year = datetime.now(timezone.utc).year
    await db.purchase_requests.delete_many({"numero": {"$regex": f"^DA-{year}-9999"}})
    await db.counters.delete_one({"_id": f"purchase_request_numero_{year}"})
    # Créer 2 DA existants avec format 5 digits
    await db.purchase_requests.insert_many([
        {"id": str(uuid.uuid4()), "numero": f"DA-{year}-99990", "designation": "test"},
        {"id": str(uuid.uuid4()), "numero": f"DA-{year}-99991", "designation": "test"},
    ])
    n1 = await get_next_purchase_request_numero()
    print(f"  -> {n1} (attendu: DA-{year}-99992)")
    assert n1 == f"DA-{year}-99992", f"got {n1}"
    n2 = await get_next_purchase_request_numero()
    print(f"  -> {n2} (attendu: DA-{year}-99993)")
    assert n2 == f"DA-{year}-99993"
    print("  ✅ purchase_request OK")

    # ─── TEST 3 : LOTO ───
    print("\n=== TEST 3 : get_next_loto_numero ===")
    await db.loto_consignations.delete_many({"numero": {"$regex": "^LOTO-9999"}})
    await db.counters.delete_one({"_id": "loto_numero"})
    # Créer 1 LOTO existant
    await db.loto_consignations.insert_one({
        "numero": "LOTO-9990", "numero_seq": 9990, "titre": "test"
    })
    numero, seq = await get_next_loto_numero()
    print(f"  -> {numero}, seq={seq} (attendu: LOTO-9991, 9991)")
    assert numero == "LOTO-9991" and seq == 9991
    numero2, seq2 = await get_next_loto_numero()
    print(f"  -> {numero2}, seq={seq2} (attendu: LOTO-9992, 9992)")
    assert numero2 == "LOTO-9992" and seq2 == 9992
    # Forcer conflit : insérer 9993
    await db.loto_consignations.insert_one({
        "numero": "LOTO-9993", "numero_seq": 9993, "titre": "blocker"
    })
    numero3, seq3 = await get_next_loto_numero()
    print(f"  -> {numero3}, seq={seq3} (attendu: LOTO-9994, sauté 9993)")
    assert numero3 == "LOTO-9994" and seq3 == 9994
    print("  ✅ loto OK")

    # Cleanup
    await db.improvements.delete_many({"titre": {"$regex": "^TEST-IMP-"}})
    await db.purchase_requests.delete_many({"numero": {"$regex": f"^DA-{year}-9999"}})
    await db.loto_consignations.delete_many({"numero": {"$regex": "^LOTO-999"}})
    await db.counters.delete_one({"_id": "improvement_numero"})
    await db.counters.delete_one({"_id": f"purchase_request_numero_{year}"})
    await db.counters.delete_one({"_id": "loto_numero"})

    print("\n🎯 TOUS LES TESTS PASSENT")

asyncio.run(main())
