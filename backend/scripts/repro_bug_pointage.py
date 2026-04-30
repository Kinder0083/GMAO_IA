"""Reproduction avancée : teste plusieurs formats initiaux de timestamp."""
import asyncio, os, uuid
from dotenv import load_dotenv; load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def run_scenario(db, label, initial_ts, updated_ts_str):
    """Crée un OT avec initial_ts, update via endpoint-like code, teste report."""
    user = await db.users.find_one({"email": "admin@test.com"}, {"_id": 1})
    uid = str(user["_id"])
    entry_id = str(uuid.uuid4())
    numero = f"TEST-REPRO-{label}"
    await db.work_orders.delete_many({"numero": numero})

    wo_doc = {
        "id": str(uuid.uuid4()),
        "numero": numero,
        "titre": f"Test {label}",
        "categorie": "TRAVAUX_CURATIF",
        "statut": "EN_COURS",
        "tempsReel": 2,
        "dateCreation": datetime.now(timezone.utc),
        "time_entries": [{
            "id": entry_id, "user_id": uid, "user_name": "x",
            "hours": 2.0, "timestamp": initial_ts
        }]
    }
    res = await db.work_orders.insert_one(wo_doc)

    # Simule le parsing backend
    new_ts = datetime.fromisoformat(updated_ts_str.replace('Z', '+00:00').replace('+00:00', ''))

    # Simule l'update endpoint
    await db.work_orders.update_one(
        {"_id": res.inserted_id, "time_entries.id": entry_id},
        {"$set": {"time_entries.$.timestamp": new_ts, "time_entries.$.hours": 2.0}}
    )

    wo_after = await db.work_orders.find_one({"_id": res.inserted_id}, {"time_entries": 1})
    stored_ts = wo_after["time_entries"][0]["timestamp"]

    # Simule la query du rapport — semaine du 20-26 avril 2026
    date_start = datetime(2026, 4, 20, 0, 0, 0)
    date_end = datetime(2026, 4, 26, 23, 59, 59)

    match = {
        "categorie": {"$in": ["TRAVAUX_CURATIF"]},
        "time_entries": {"$elemMatch": {"user_id": uid, "timestamp": {"$gte": date_start, "$lte": date_end}}}
    }
    cnt = await db.work_orders.count_documents(match)
    print(f"  [{label}] initial={type(initial_ts).__name__:<10} stored={type(stored_ts).__name__:<10} → count={cnt} {'✅' if cnt else '❌'}")
    print(f"          stored value: {stored_ts!r}")

    await db.work_orders.delete_one({"_id": res.inserted_id})


async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]

    print("\n=== Test chemins update timestamp ===\n")

    # Scénario 1 : initial datetime aware UTC
    await run_scenario(db, "dt-aware",
                       datetime(2026, 4, 30, 15, 0, 0, tzinfo=timezone.utc),
                       "2026-04-26T10:00:00.000Z")

    # Scénario 2 : initial string ISO (cas legacy)
    await run_scenario(db, "str-iso",
                       "2026-04-30T15:00:00.000Z",
                       "2026-04-26T10:00:00.000Z")

    # Scénario 3 : initial string ISO SANS Z
    await run_scenario(db, "str-no-z",
                       "2026-04-30T15:00:00",
                       "2026-04-26T10:00:00.000Z")

    # Scénario 4 : frontend envoie SANS heure (juste date YYYY-MM-DD)
    # (ce cas n'arrive pas avec le frontend actuel mais testons)
    await run_scenario(db, "str-no-z-dt", "2026-04-30T15:00:00", "2026-04-26")

asyncio.run(main())
