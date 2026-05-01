"""Test du retry-on-conflict de get_next_work_order_numero()."""
import asyncio, os, uuid
from dotenv import load_dotenv; load_dotenv()
import sys
sys.path.insert(0, '/app/backend')
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    # Patch le module shared pour utiliser cette db
    import routes.shared as shared
    shared.db = db
    from routes.shared import get_next_work_order_numero

    # Cleanup
    await db.work_orders.delete_many({"titre": {"$regex": "^RETRY-TEST"}})

    # Étape 1 : récupérer le seq actuel
    counter = await db.counters.find_one({"_id": "work_order_numero"})
    initial = (counter or {}).get("seq", 0)
    print(f"Compteur initial: {initial}")

    # Étape 2 : créer 3 OT avec des numéros qui vont être les 3 prochains du compteur
    # On veut forcer le bug : compteur est à X, mais X+1, X+2, X+3 sont déjà pris
    next1, next2, next3 = str(initial + 1), str(initial + 2), str(initial + 3)
    for n in (next1, next2, next3):
        await db.work_orders.insert_one({
            "id": str(uuid.uuid4()), "numero": n,
            "titre": f"RETRY-TEST déjà-pris-{n}",
            "categorie": "TRAVAUX_DIVERS", "statut": "OUVERT",
            "dateCreation": datetime.now(timezone.utc),
        })
    print(f"3 OT créés avec numéros pré-existants : {next1}, {next2}, {next3}")
    # NB: le compteur est encore à `initial`. Le prochain $inc lui donnera initial+1
    # qui est DÉJÀ PRIS → la sécurité doit boucler jusqu'à trouver un libre

    # Étape 3 : appeler get_next_work_order_numero() — doit sauter aux 3 OT existants
    # et retourner initial+4
    new_numero = await get_next_work_order_numero()
    print(f"\nget_next_work_order_numero() a retourné : {new_numero}")
    expected = str(initial + 4)
    if new_numero == expected:
        print(f"✅ OK — numéro {expected} attendu et obtenu (les 3 conflits ont bien été sautés)")
    else:
        print(f"❌ FAIL — attendu {expected}, obtenu {new_numero}")

    # Vérifier que le numéro retourné est bien libre
    exists = await db.work_orders.find_one({"numero": new_numero})
    print(f"Numéro {new_numero} libre en base ? {'OUI ✅' if not exists else 'NON ❌'}")

    # Vérifier que le compteur a bien avancé
    counter_after = await db.counters.find_one({"_id": "work_order_numero"})
    print(f"Compteur après : {counter_after['seq']} (attendu : {initial + 4})")

    # Cleanup
    await db.work_orders.delete_many({"titre": {"$regex": "^RETRY-TEST"}})
    print("\nCleanup OK")

asyncio.run(main())
